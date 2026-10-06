import React from 'react';
import AdminTagsView from './AdminTagsView';

/** Filtered catalog view: tags with isProtected=true. */
const AdminTagProtectedView: React.FC = () => <AdminTagsView protectedOnly />;

export default AdminTagProtectedView;
