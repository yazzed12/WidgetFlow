import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Bell,
  CheckCheck,
  Clock,
  MessageSquare,
  FileSpreadsheet,
  Shield,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import type { Notification } from '../types';

type NotificationTab = 'All' | 'Unread' | 'Templates' | 'Reports' | 'Comments';

export const NotificationsPage: React.FC = () => {
  const {
    currentUser,
    notifications,
    templates,
    reports,
    markNotificationRead,
    markAllNotificationsRead,
    openTemplateDetail,
    openReportViewModal,
    setActiveView,
  } = useApp();

  const [activeTab, setActiveTab] = useState<NotificationTab>('All');

  // Filter notifications for active user
  const userNotifications = notifications.filter((n) => n.userId === currentUser.id);

  const filteredNotifications = userNotifications.filter((n) => {
    switch (activeTab) {
      case 'Unread':
        return !n.read;
      case 'Templates':
        return (
          n.type === 'approval_required' ||
          n.type === 'template_approved' ||
          n.type === 'template_rejected'
        );
      case 'Reports':
        return (
          n.type === 'report_received' ||
          n.type === 'report_returned' ||
          n.type === 'report_signed' ||
          n.type === 'report_rejected'
        );
      case 'Comments':
        return n.type === 'comment_added';
      case 'All':
      default:
        return true;
    }
  });

  // Timeline Grouping
  const groupNotificationsByDate = (notifs: Notification[]) => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const earlier: Notification[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    notifs.forEach((n) => {
      const time = new Date(n.timestamp).getTime();
      if (time >= todayStart) {
        today.push(n);
      } else if (time >= yesterdayStart) {
        yesterday.push(n);
      } else {
        earlier.push(n);
      }
    });

    return { today, yesterday, earlier };
  };

  const { today, yesterday, earlier } = groupNotificationsByDate(filteredNotifications);

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'approval_required':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'template_approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'template_rejected':
      case 'report_rejected':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      case 'report_received':
        return <FileSpreadsheet className="w-4 h-4 text-indigo-600" />;
      case 'report_returned':
        return <RotateCcw className="w-4 h-4 text-amber-600" />;
      case 'report_signed':
        return <Shield className="w-4 h-4 text-emerald-600" />;
      case 'comment_added':
        return <MessageSquare className="w-4 h-4 text-blue-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const handleNotificationClick = (notif: Notification) => {
    markNotificationRead(notif.id);

    if (notif.relatedEntityId) {
      const targetTemplate = templates.find((t) => t.id === notif.relatedEntityId);
      if (targetTemplate) {
        if (targetTemplate.status === 'Approved') {
          openTemplateDetail(targetTemplate);
        } else if (targetTemplate.requestedApprovalFromUserId === currentUser.id) {
          setActiveView('approvals');
        } else {
          setActiveView('my-requests');
        }
      }
    } else if (notif.relatedReportId) {
      const targetReport = reports.find((r) => r.id === notif.relatedReportId);
      if (targetReport) {
        openReportViewModal(targetReport);
      } else {
        setActiveView('reports');
      }
    }
  };

  const renderNotificationItem = (notif: Notification) => (
    <div
      key={notif.id}
      onClick={() => handleNotificationClick(notif)}
      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 group ${
        notif.read
          ? 'bg-white border-slate-200/80 hover:bg-slate-50'
          : 'bg-indigo-50/40 border-indigo-200/90 shadow-2xs hover:bg-indigo-50/70'
      }`}
    >
      <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${notif.read ? 'bg-slate-100' : 'bg-white shadow-xs'}`}>
        {getNotificationIcon(notif.type)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
            {notif.title}
          </h4>
          <span className="text-[10px] text-slate-400 font-medium shrink-0">
            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{notif.message}</p>
      </div>

      {!notif.read && (
        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 self-center" title="Unread" />
      )}
    </div>
  );

  const tabs: NotificationTab[] = ['All', 'Unread', 'Templates', 'Reports', 'Comments'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />
            Notifications Inbox ({userNotifications.length})
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Stay updated on template approval requests, report reviews, comments, and signatures.
          </p>
        </div>

        <button
          onClick={markAllNotificationsRead}
          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 border border-indigo-200"
        >
          <CheckCheck className="w-4 h-4" />
          <span>Mark all as read</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto text-xs">
        {tabs.map((tab) => {
          const count = userNotifications.filter((n) => {
            if (tab === 'Unread') return !n.read;
            if (tab === 'Templates') return n.type.includes('template') || n.type === 'approval_required';
            if (tab === 'Reports') return n.type.includes('report');
            if (tab === 'Comments') return n.type === 'comment_added';
            return true;
          }).length;

          const isSelected = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-2 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>{tab}</span>
              <span
                className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                  isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notifications List Grouped by Timeline */}
      {filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs space-y-2 shadow-xs">
          <Bell className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">No notifications found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You have no notifications under {activeTab}. New review requests and updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {today.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Today</h3>
              <div className="space-y-2">{today.map(renderNotificationItem)}</div>
            </div>
          )}

          {yesterday.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Yesterday</h3>
              <div className="space-y-2">{yesterday.map(renderNotificationItem)}</div>
            </div>
          )}

          {earlier.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Earlier</h3>
              <div className="space-y-2">{earlier.map(renderNotificationItem)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
