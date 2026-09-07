import React from 'react';

export const AuthSubmitButton: React.FC<{
  pending: boolean;
  label: string;
  pendingLabel: string;
}> = ({ pending, label, pendingLabel }) => (
  <button
    type="submit"
    disabled={pending}
    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {pending ? pendingLabel : label}
  </button>
);

