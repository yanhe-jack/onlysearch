import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeScreenshot, generateAssistantReply } from './aiLogic';
import { ContextSettings, Message, UnlockAllowance } from './types';
import './App.css';

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad = (value: number) => value.toString().padStart(2, '0');

const formatDateForContext = (date: Date) =>
  `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日（${weekdays[date.getDay()]}）${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatMessageTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatClock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const createMessage = (role: Message['role'], content: string, action?: Message['action']): Message => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  role,
  content,
  action,
  createdAt: new Date().toISOString(),
});

const initialContext: ContextSettings = {
  currentTime: formatDateForContext(new Date()),
  unlockSceneDesc: '回复工作消息、查看今日待办',
  supplementaryTips: '使用完记得活动一下肩颈，喝口水～',
  userInfo: '你是一位正在准备重要汇报的产品经理。',
};

const initialMessages = [
  createMessage('assistant', '嗨～我是你的专注伙伴，需要解锁的话先告诉我你的目标哦。'),
];

const computeRemaining = (allowance: UnlockAllowance | null, now: Date) => {
  if (!allowance?.expiresAt) {
    return '';
  }
  const target = new Date(allowance.expiresAt).getTime();
  const diff = target - now.getTime();
  if (Number.isNaN(target) || diff <= 0) {
    return '已到时';
  }
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${pad(minutes)}:${pad(seconds)}`;
};

function App() {
  const [context, setContext] = useState<ContextSettings>(initialContext);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<'locked' | 'unlocked'>('locked');
  const [allowance, setAllowance] = useState<UnlockAllowance | null>(null);
  const [userInput, setUserInput] = useState('');
  const [screenshotDesc, setScreenshotDesc] = useState('');
  const [now, setNow] = useState(() => new Date());
  const expiryHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === 'unlocked' && allowance?.expiresAt) {
      const expireAt = new Date(allowance.expiresAt);
      if (!Number.isNaN(expireAt.getTime()) && now >= expireAt) {
        if (expiryHandledRef.current !== allowance.expiresAt) {
          expiryHandledRef.current = allowance.expiresAt;
          setStatus('locked');
          setAllowance(null);
          setMessages((prev) => [
            ...prev,
            createMessage('assistant', '这轮约定的使用时间到了，我先帮你锁回专注模式，有需要再叫我哦。', 'lock'),
          ]);
        }
      } else {
        expiryHandledRef.current = null;
      }
    } else {
      expiryHandledRef.current = null;
    }
  }, [allowance, now, status]);

  const remaining = useMemo(() => computeRemaining(allowance, now), [allowance, now]);

  const handleContextChange = (field: keyof ContextSettings) => (value: string) => {
    setContext((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userInput.trim()) {
      return;
    }

    const userMessage = createMessage('user', userInput.trim());
    const nextHistory = [...messages, userMessage];
    const assistantReply = generateAssistantReply(
      userInput.trim(),
      nextHistory,
      context,
      allowance,
      status === 'unlocked',
    );

    const nextMessages = [...nextHistory, createMessage('assistant', assistantReply.reply, assistantReply.action)];
    if (assistantReply.followUpQuestion) {
      nextMessages.push(createMessage('assistant', assistantReply.followUpQuestion));
    }

    setMessages(nextMessages);
    setUserInput('');

    if (assistantReply.action === 'unlock' && assistantReply.allowance) {
      const expiresAt = assistantReply.allowance.durationMinutes
        ? new Date(Date.now() + assistantReply.allowance.durationMinutes * 60000).toISOString()
        : undefined;
      setAllowance({ ...assistantReply.allowance, expiresAt });
      setStatus('unlocked');
    } else if (assistantReply.action === 'lock') {
      setAllowance(null);
      setStatus('locked');
    }
  };

  const handleAnalyze = () => {
    const result = analyzeScreenshot(screenshotDesc, allowance);
    setScreenshotDesc('');
    setMessages((prev) => [...prev, createMessage('assistant', result.message, result.result === 'deviation' ? 'lock' : undefined)]);
    if (result.result === 'deviation') {
      setStatus('locked');
      setAllowance(null);
    }
  };

  const handleReset = () => {
    setMessages(initialMessages);
    setStatus('locked');
    setAllowance(null);
    setUserInput('');
    setScreenshotDesc('');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#1f2d4d' }}>专注解锁助手</h1>
          <p style={{ margin: '6px 0 0', color: '#5f6f92', fontSize: '14px' }}>
            根据 PRD 模拟的 GPT-4o 自律管理流程，协助你管理解锁请求与专注监控。
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <span className={`status-pill ${status}`}>{status === 'locked' ? '🔒 已锁定' : '🔓 使用中'}</span>
          <div className="timeline">
            <span>当前时间：{formatClock(now)}</span>
            {allowance?.scenario ? <span>当前任务：{allowance.scenario}</span> : <span>当前任务：等待申请</span>}
            {status === 'unlocked' && allowance?.expiresAt ? <span>剩余时间：{remaining}</span> : null}
          </div>
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2 className="section-title">使用背景配置</h2>
          <div className="field-group">
            <label>
              当前时间
              <input
                type="text"
                value={context.currentTime}
                onChange={(event) => handleContextChange('currentTime')(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => handleContextChange('currentTime')(formatDateForContext(new Date()))}>
              同步为此刻时间
            </button>
            <label>
              允许解锁的场景
              <textarea
                value={context.unlockSceneDesc}
                onChange={(event) => handleContextChange('unlockSceneDesc')(event.target.value)}
                placeholder="例如：回复工作消息、线上会议、查资料"
              />
            </label>
            <label>
              其他提醒
              <textarea
                value={context.supplementaryTips}
                onChange={(event) => handleContextChange('supplementaryTips')(event.target.value)}
                placeholder="例如：注意坐姿、每 30 分钟起身活动"
              />
            </label>
            <label>
              用户信息
              <textarea
                value={context.userInfo}
                onChange={(event) => handleContextChange('userInfo')(event.target.value)}
                placeholder="例如：自由职业设计师，正在准备重要提案"
              />
            </label>
          </div>
          <div className="tips-box" style={{ marginTop: '16px' }}>
            <strong>提示</strong>
            <span>
              这些配置会作为 Prompt 的变量，帮助助手判断解锁请求是否合理。你可以随时修改并重新发起申请。
            </span>
          </div>
        </section>

        <section className="panel chat-panel">
          <h2 className="section-title">解锁对话</h2>
          <div className="chat-history">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <span>{message.content}</span>
                <small>{message.role === 'user' ? '你' : '助手'} · {formatMessageTime(message.createdAt)}</small>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={handleSubmit}>
            <textarea
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              placeholder="描述你想要解锁的理由、目标和预计使用时长，例如：\n“我需要 15 分钟回复项目群的消息。”"
            />
            <div className="inline-actions">
              <button type="submit">发送给助手</button>
              <button type="button" onClick={handleReset} style={{ background: '#eff2fb', color: '#3c4d6d' }}>
                重置会话
              </button>
              {allowance?.durationMinutes ? (
                <span className="badge">本轮授权：{allowance.durationMinutes} 分钟</span>
              ) : null}
            </div>
          </form>

          <div className="monitor-card">
            <h3 style={{ margin: 0, fontSize: '16px', color: '#24314c' }}>截图行为判定（模拟）</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#5f6f92' }}>
              每 60 秒会对屏幕进行一次分析。这里可以输入对截图的描述，模拟 GPT-4o 的判断流程。
            </p>
            <textarea
              value={screenshotDesc}
              onChange={(event) => setScreenshotDesc(event.target.value)}
              placeholder="例如：正在浏览短视频、正在查看项目需求文档"
            />
            <div className="inline-actions">
              <button type="button" onClick={handleAnalyze} disabled={!screenshotDesc.trim()}>
                分析截图
              </button>
              <span className="badge">当前权限：{allowance?.scenario ?? '未解锁'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
