import React from 'react';
import AdminTagCorrectionsView from './AdminTagCorrectionsView';

/** Top-level admin tab: all tag terms blacklisted via tag corrections. */
const AdminTagBlacklistView: React.FC = () => (
    <AdminTagCorrectionsView mode="blacklist-only" />
);

export default AdminTagBlacklistView;
