import { MessageCircle } from 'lucide-react';

export default function TelegramPage() {
  return <div className="panel"><div className="panel-head"><div><h3><MessageCircle size={15}/> Telegram</h3><span>Telegram integration is not configured in this build.</span></div><span className="badge">INFO</span></div><div className="empty">No Telegram management API is currently exposed.</div></div>;
}
