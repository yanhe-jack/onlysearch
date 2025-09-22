import { AssistantReply, ContextSettings, Message, UnlockAllowance } from './types';

const encouragement = ['记得深呼吸一下再继续～', '保持节奏，做完这一轮就可以休息啦。', '我在这儿陪你，一起完成目标。'];

const goalKeywords = ['工作', '学习', '复习', '作业', '论文', '报告', '家人', '消息', '会议', '演讲', '演示', '面试', '购物', '支付', '导航', '备忘', '记账', '健身', '打车'];
const denyKeywords = ['刷', '游戏', 'b站', 'b 站', '抖音', '微博', '短视频', '视频', '摸鱼', '放松', '追剧', '小说', '娱乐'];
const urgentKeywords = ['紧急', '立刻', '马上', '重要', 'deadline', '急用', '加急', '救', '医院', '家人'];

const chineseNumberMap: Record<string, number> = {
  十: 10,
  半: 0.5,
};

const randomPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const parseDurationMinutes = (text: string): number | undefined => {
  const durationRegex = /(\d+(?:\.\d+)?)\s*(分钟|分|小时|h|hr|min|m)/i;
  const match = text.match(durationRegex);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      const unit = match[2];
      if (/小时|h|hr/i.test(unit)) {
        return Math.round(value * 60);
      }
      return Math.round(value);
    }
  }

  const chineseMatch = text.match(/([一二三四五六七八九十半]+)\s*(分钟|分|小时)/);
  if (chineseMatch) {
    const str = chineseMatch[1];
    if (str === '半') {
      return /小时/.test(chineseMatch[2]) ? 30 : 0.5;
    }

    let total = 0;
    for (const char of str) {
      if (char in chineseNumberMap) {
        total += chineseNumberMap[char];
      } else {
        const idx = '零一二三四五六七八九'.indexOf(char);
        if (idx > -1) {
          total += idx;
        }
      }
    }
    if (/小时/.test(chineseMatch[2])) {
      return total * 60;
    }
    return total;
  }

  return undefined;
};

const containsKeyword = (text: string, keywords: string[]) => keywords.some((word) => text.includes(word));

export const generateAssistantReply = (
  userMessage: string,
  history: Message[],
  context: ContextSettings,
  currentAllowance: UnlockAllowance | null,
  isCurrentlyUnlocked: boolean,
): AssistantReply => {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return {
      reply: '我还没听清楚呢，可以再描述下你想做什么吗？',
    };
  }

  if (isCurrentlyUnlocked && currentAllowance) {
    const finished = /(完成|结束|搞定|处理好了|用完)/.test(trimmed);
    const wantsExtend = /(延长|再给|多用|继续用|再用|还能用)/.test(trimmed);

    if (finished) {
      return {
        reply: '辛苦啦，今天这段任务完成得很好，我先帮你锁回专注模式。',
        action: 'lock',
        allowance: null,
      };
    }

    if (!wantsExtend) {
      return {
        reply: `手机现在还在解锁中，用于「${currentAllowance.scenario}」。如果需要调整或延长，跟我说明一下就好。`,
      };
    }
  }

  const normalized = trimmed.toLowerCase();

  if (containsKeyword(normalized, denyKeywords) && !containsKeyword(normalized, urgentKeywords)) {
    return {
      reply: '这个理由好像有点偏离今天的计划啦，不如先坚持一下，再回来休息？',
    };
  }

  const hasGoal = containsKeyword(trimmed, goalKeywords) || trimmed.length > 8;

  const durationMinutes = parseDurationMinutes(trimmed);

  const latestAssistant = [...history].reverse().find((msg) => msg.role === 'assistant');
  const previouslyAskedForDuration = latestAssistant?.content.includes('多长时间');

  if (!hasGoal) {
    return {
      reply: '能具体说下你想处理的事情吗？我想确认一下它和你的今日目标是否一致。',
    };
  }

  if (!durationMinutes) {
    const hint = previouslyAskedForDuration
      ? '还是没抓到时间安排呢，大概需要多久比较合适？'
      : '大概需要多长时间呢？我想帮你守好节奏。';
    return {
      reply: hint,
    };
  }

  if (durationMinutes > 120 && !containsKeyword(normalized, urgentKeywords)) {
    return {
      reply: '这次时长有点久了，要不我们拆成一小段一小段来完成？先申请 60 分钟以内的吧。',
    };
  }

  const scenario = trimmed;
  const allowance: UnlockAllowance = {
    scenario,
    durationMinutes,
    notes: context.supplementaryTips || undefined,
  };

  const timeInfo = context.currentTime ? `现在是 ${context.currentTime}。` : '';
  const sceneReminder = context.unlockSceneDesc
    ? `记得把手机用在：${context.unlockSceneDesc}。`
    : '记得只聚焦在刚才提到的事情上。';
  const persona = context.userInfo ? `与你的身份设定「${context.userInfo}」保持一致。` : '';
  const tip = context.supplementaryTips ? `另外 ${context.supplementaryTips}` : randomPick(encouragement);

  const reply = `好的，为你解锁 ${durationMinutes} 分钟。${timeInfo}${sceneReminder} ${persona} ${tip}`.trim();

  return {
    reply,
    action: 'unlock',
    allowance,
  };
};

const tokenize = (text: string) =>
  text
    .replace(/[，。！？,.!?:；;\n]/g, ' ')
    .split(' ')
    .map((segment) => segment.trim())
    .filter(Boolean);

const positiveTokens = ['只', '正在', '专注', '处理', '回复', '记录'];

export const analyzeScreenshot = (
  description: string,
  allowance: UnlockAllowance | null,
): { result: 'ok' | 'deviation'; message: string } => {
  const trimmed = description.trim();
  if (!trimmed) {
    return {
      result: 'ok',
      message: '还没有截图描述，我会继续帮你观察～',
    };
  }

  if (!allowance) {
    return {
      result: 'deviation',
      message: '当前并没有开放的使用权限，我先帮你锁回专注模式哦。',
    };
  }

  const tokens = tokenize(allowance.scenario + ' ' + trimmed);
  const hasPositive = tokens.some((token) => positiveTokens.some((p) => token.includes(p)));
  const matchAllowance = tokens.some((token) => allowance.scenario.includes(token) && token.length > 1);

  const entertainmentHit = containsKeyword(trimmed.toLowerCase(), denyKeywords);

  if (entertainmentHit || (!hasPositive && !matchAllowance)) {
    return {
      result: 'deviation',
      message: '这张截图看起来和刚才的目标有些偏差了，先帮你锁一下手机，我们再确认下需求。',
    };
  }

  return {
    result: 'ok',
    message: '未偏离',
  };
};
