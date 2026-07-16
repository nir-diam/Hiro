import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GlobeAmericasIcon, ShieldCheckIcon } from './Icons';
import AdminCompaniesView from './AdminCompaniesView';
import AdminCompanyQualityView from './AdminCompanyQualityView';

type Tab = 'db' | 'quality';

const AdminCompaniesTabsView: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState<Tab>(tabFromUrl === 'db' ? 'db' : 'quality');

    useEffect(() => {
        if (tabFromUrl === 'quality' || tabFromUrl === 'db') {
            setActiveTab(tabFromUrl);
        }
    }, [tabFromUrl]);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'db',      label: 'מסד נתוני חברות', icon: <GlobeAmericasIcon className="w-4 h-4" /> },
        { id: 'quality', label: 'בקרת איכות דאטה', icon: <ShieldCheckIcon className="w-4 h-4" /> },
    ];

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        }, { replace: true });
    };

    return (
        <div className="space-y-4">
            {/* Outer tab bar */}
            <div className="flex gap-1 border-b border-border-default">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
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
