import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Send, MessageSquare } from 'lucide-react';

interface ReportCommentThreadProps {
  reportId: string;
}

export const ReportCommentThread: React.FC<ReportCommentThreadProps> = ({ reportId }) => {
  const { currentUser, reportComments, addReportComment } = useApp();
  const [newMessage, setNewMessage] = useState('');

  const comments = reportComments.filter((c) => c.reportId === reportId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    addReportComment(reportId, newMessage.trim());
    setNewMessage('');
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          Report Discussion & Review Feedback ({comments.length})
        </h4>
      </div>

      {/* Conversation Thread */}
      <div className="space-y-3 max-h-60 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs italic">
            No comments posted yet for this report. Start the conversation below.
          </div>
        ) : (
          comments.map((cmt) => {
            const isMe = cmt.userId === currentUser.id;
            return (
              <div
                key={cmt.id}
                className={`flex gap-2.5 text-xs ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-7 h-7 rounded-full text-white font-bold flex items-center justify-center text-[10px] shrink-0 ${
                    isMe ? 'bg-indigo-600' : 'bg-slate-600'
                  }`}
                >
                  {cmt.userAvatar}
                </div>

                <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 text-[10px] text-slate-500 ${isMe ? 'justify-end' : ''}`}>
                    <span className="font-bold text-slate-800">{cmt.userName}</span>
                    <span>({cmt.role})</span>
                    <span>•</span>
                    <span>{formatTime(cmt.createdAt)}</span>
                  </div>

                  <div
                    className={`p-3 rounded-xl leading-relaxed text-xs ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-xs'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs'
                    }`}
                  >
                    {cmt.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Write a comment or review note on this report..."
          className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-slate-400"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
