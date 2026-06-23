import React, { useState } from 'react';
import { GlobeAmericasIcon, ShieldCheckIcon } from './Icons';
import AdminCompaniesView from './AdminCompaniesView';
import AdminCompanyQualityView from './AdminCompanyQualityView';

type Tab = 'db' | 'quality';

const AdminCompaniesTabsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('db');

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'db',      label: 'מסד נתוני חברות', icon: <GlobeAmericasIcon className="w-4 h-4" /> },
        { id: 'quality', label: 'בקרת איכות דאטה', icon: <ShieldCheckIcon className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-4">
            {/* Outer tab bar */}
            <div className="flex gap-1 border-b border-border-default">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors rounded-t-lg -mb-px ${
                            activeTab === tab.id
                                ? 'border border-b-bg-card border-border-default bg-bg-card text-primary-600'
                                : 'text-text-muted hover:text-text-default hover:bg-bg-hover'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'db'      && <AdminCompaniesView />}
            {activeTab === 'quality' && <AdminCompanyQualityView />}
        </div>
    );
};

export default AdminCompaniesTabsView;
