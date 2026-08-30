import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { RequestCommentThread } from '../approvals/RequestCommentThread';
import { X, MessageSquare, ChevronLeft, Layers } from 'lucide-react';
import type { WidgetTemplate } from '../../types';

interface RequestChatDrawerProps {
  onClose: () => void;
}

export const RequestChatDrawer: React.FC<RequestChatDrawerProps> = ({ onClose }) => {
  const { currentUser, templates, categories } = useApp();
  const [selectedTemplate, setSelectedTemplate] = useState<WidgetTemplate | null>(null);

  // Relevant templates where user is creator or requested approver
  const relevantTemplates = templates.filter(
    (t) => t.createdById === currentUser.id || t.requestedApprovalFromUserId === currentUser.id
  );

  const getCategoryName = (catId: string) => {
    return categories.find((c) => c.id === catId)?.name || 'General';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-left border-l border-slate-200">
        {/* Drawer Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedTemplate ? (
              <button
                onClick={() => setSelectedTemplate(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                title="Back to conversations list"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                <MessageSquare className="w-4 h-4" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {selectedTemplate ? selectedTemplate.name : 'Template Request Discussions'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {selectedTemplate
                  ? `Category: ${getCategoryName(selectedTemplate.categoryId)}`
                  : 'Active template request review threads'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {selectedTemplate ? (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="font-bold text-slate-900">{selectedTemplate.name}</div>
                <p className="text-slate-500 mt-0.5 leading-relaxed">{selectedTemplate.description}</p>
                <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-2">
                  <span>Author: {selectedTemplate.createdByName}</span>
                  <span>•</span>
                  <span className="font-semibold text-indigo-600">Status: {selectedTemplate.status}</span>
                </div>
              </div>

              <RequestCommentThread templateId={selectedTemplate.id} />
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
                Select a Template Request Conversation
              </span>

              {relevantTemplates.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                  <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                  <h4 className="font-semibold text-slate-700">No active template discussions</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Conversations will appear here when template creation requests are submitted for approval.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {relevantTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl)}
                      className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {tpl.name}
                        </h4>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.2 rounded border shrink-0 ${
                            tpl.status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : tpl.status === 'Pending Approval'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {tpl.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">{tpl.description}</p>
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>By {tpl.createdByName} ({tpl.createdByRole})</span>
                        <span className="text-indigo-600 font-semibold group-hover:underline">Open thread →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
