import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { setApiDemoUserId } from './services/apiService';
import { RoleSwitcher } from './components/layout/RoleSwitcher';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { Toast } from './components/common/Toast';

import { TemplateDetailModal } from './components/templates/TemplateDetailModal';

const TemplateBuilder = React.lazy(() =>
  import('./components/template-builder/TemplateBuilder').then((m) => ({ default: m.TemplateBuilder }))
);
import { RequestDetailDrawer } from './components/requests/RequestDetailDrawer';
import { ApprovalDetailDrawer } from './components/approvals/ApprovalDetailDrawer';
import { RequestChatDrawer } from './components/chat/RequestChatDrawer';
import { FillReportModal } from './components/reports/FillReportModal';
import { ReportViewModal } from './components/reports/ReportViewModal';
import { SendReportModal } from './components/reports/SendReportModal';
import { ReturnReportModal } from './components/reports/ReturnReportModal';
import { RejectReportModal } from './components/reports/RejectReportModal';
import { SignReportModal } from './components/reports/SignReportModal';
import { ProfileModal } from './components/profile/ProfileModal';
import { ResetDemoModal } from './components/common/ResetDemoModal';

import { DashboardPage } from './pages/DashboardPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { MyRequestsPage } from './pages/MyRequestsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { EngineProofPage } from './pages/EngineProofPage';

import { SystemConfigProvider } from './context/SystemConfigContext';
import { AdminLayout } from './components/admin/AdminLayout';

const MainContent: React.FC = () => {
  const { activeView, hasPermission } = useApp();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardPage />;
      case 'templates':
        return hasPermission('templates.view_approved') ? <TemplatesPage /> : <DashboardPage />;
      case 'my-requests':
        return hasPermission('templates.create') || hasPermission('templates.edit_own_draft') ? <MyRequestsPage /> : <DashboardPage />;
      case 'approvals':
        return hasPermission('template_approvals.view') ? <ApprovalsPage /> : <DashboardPage />;
      case 'reports':
        return hasPermission('reports.view_own') || hasPermission('reports.view_received') || hasPermission('reports.view_organization') ? <ReportsPage /> : <DashboardPage />;
      case 'notifications':
        return hasPermission('notifications.view') ? <NotificationsPage /> : <DashboardPage />;
      case 'engine-proof':
        return <EngineProofPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
      {renderView()}
    </main>
  );
};

const GlobalModals: React.FC = () => {
  const {
    isAddModalOpen,
    draftToEdit,
    closeAddTemplateModal,
    isChatDrawerOpen,
    isProfileModalOpen,
    isResetDemoModalOpen,
    toggleChatDrawer,
    selectedTemplateForDetail,
    closeTemplateDetail,
    selectedRequestForDrawer,
    closeRequestDetail,
    selectedApprovalForDrawer,
    closeApprovalDetail,
    selectedTemplateForFill,
    closeFillReportModal,
    selectedReportForView,
    closeReportViewModal,
    selectedReportForSend,
    closeSendReportModal,
    selectedReportForReturn,
    closeReturnReportModal,
    selectedReportForReject,
    closeRejectReportModal,
    selectedReportForSign,
    closeSignReportModal,
    closeProfileModal,
    closeResetDemoModal,
    hasPermission,
  } = useApp();

  return (
    <>
      {isAddModalOpen && hasPermission('templates.create') && hasPermission('studio.access') && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center text-white font-bold text-sm">Loading Studio...</div>}>
          <TemplateBuilder
            initialTemplate={draftToEdit}
            onClose={closeAddTemplateModal}
          />
        </React.Suspense>
      )}

      {selectedTemplateForDetail && (
        <TemplateDetailModal
          template={selectedTemplateForDetail}
          onClose={closeTemplateDetail}
        />
      )}

      {selectedRequestForDrawer && (
        <RequestDetailDrawer
          template={selectedRequestForDrawer}
          onClose={closeRequestDetail}
        />
      )}

      {selectedApprovalForDrawer && (
        <ApprovalDetailDrawer
          template={selectedApprovalForDrawer}
          onClose={closeApprovalDetail}
        />
      )}

      {selectedTemplateForFill && hasPermission('templates.use') && hasPermission('reports.create') && (
        <FillReportModal
          template={selectedTemplateForFill}
          onClose={closeFillReportModal}
        />
      )}

      {selectedReportForView && (
        <ReportViewModal
          report={selectedReportForView}
          onClose={closeReportViewModal}
        />
      )}

      {selectedReportForSend && hasPermission('reports.send') && (
        <SendReportModal
          report={selectedReportForSend}
          onClose={closeSendReportModal}
        />
      )}

      {selectedReportForReturn && hasPermission('reports.return') && (
        <ReturnReportModal
          report={selectedReportForReturn}
          onClose={closeReturnReportModal}
        />
      )}

      {selectedReportForReject && hasPermission('reports.reject') && (
        <RejectReportModal
          report={selectedReportForReject}
          onClose={closeRejectReportModal}
        />
      )}

      {selectedReportForSign && hasPermission('reports.sign') && (
        <SignReportModal
          report={selectedReportForSign}
          onClose={closeSignReportModal}
        />
      )}

      {isProfileModalOpen && (
        <ProfileModal onClose={closeProfileModal} />
      )}

      {isResetDemoModalOpen && (
        <ResetDemoModal onClose={closeResetDemoModal} />
      )}

      {isChatDrawerOpen && (
        <RequestChatDrawer onClose={() => toggleChatDrawer(false)} />
      )}
    </>
  );
};

const AppShell: React.FC = () => {
  const { currentUser } = useApp();

  React.useEffect(() => {
    if (currentUser?.id) {
      setApiDemoUserId(currentUser.id);
    }
  }, [currentUser?.id]);

  if (currentUser.roleKey === 'admin' && currentUser.roleType === 'System' && currentUser.roleProtected) {
    return <AdminLayout />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
      {/* Top Demo Mode Banner */}
      <RoleSwitcher />

      {/* Main Application Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Navbar */}
          <Navbar />

          {/* Page View */}
          <MainContent />
        </div>
      </div>

      {/* Global Modals & Drawers */}
      <GlobalModals />

      {/* Global Toast */}
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <SystemConfigProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </SystemConfigProvider>
  );
}
