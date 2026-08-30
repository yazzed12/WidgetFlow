import React from 'react';
import type { ReportInstance } from '../../types';
import { useApp } from '../../context/AppContext';
import { ReportSignatureModal } from '../report/ReportSignatureModal';

interface SignReportModalProps {
  report: ReportInstance;
  onClose: () => void;
}

export const SignReportModal: React.FC<SignReportModalProps> = ({ report, onClose }) => {
  const { currentUser, signReport } = useApp();

  return (
    <ReportSignatureModal
      reportTitle={report.title}
      signatureRole={report.createdById === currentUser.id ? 'sender' : 'receiver'}
      currentUser={currentUser}
      onConfirm={async (payload) => {
        await signReport(report.id, payload);
      }}
      onClose={onClose}
    />
  );
};
