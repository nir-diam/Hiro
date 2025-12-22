import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './Icons';

type EventType = 'ראיון' | 'פגישה' | 'תזכורת' | 'משימת מערכת';
type EventStatus = 'עתידי' | 'הושלם' | 'בוטל';

interface Event {
  id: number;
  type: EventType;
  title: string;
  date: string;
  coordinator: string;
  status: EventStatus;
  linkedTo: { type: string; name: string } | null;
  description: string;
}

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<Event, 'id' | 'status' | 'linkedTo'> & { id?: number }) => void;
  event: Event | null;
  context?: 'candidate' | 'client';
}

const EventFormModal: React.FC<EventFormModalProps> = ({ isOpen, onClose, onSave, event, context = 'candidate' }) => {
  const [formData, setFormData] = useState({
    title: '',
    type: 'פגישה' as EventType,
    date: '',
    time: '',
    description: '',
    coordinator: 'דנה כהן',
    participants: '',
    linkedTo: '',
    reminder: false,
    reminderTime: '15',
  });

  useEffect(() => {
    if (event) {
      const eventDate = new Date(event.date);
      setFormData({
        title: event.title,
        type: event.type,
        date: eventDate.toISOString().split('T')[0],
        time: eventDate.toTimeString().substring(0, 5),
        description: event.description,
        coordinator: event.coordinator,
        participants: 'גדעון שפירא', // Mock data
        linkedTo: event.linkedTo ? `${event.linkedTo.type}: ${event.linkedTo.name}` : '',
        reminder: true,
        reminderTime: '30',
      });
    } else {
      // Reset form for new event
      setFormData({
        title: '',
        type: 'פגישה',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().substring(0, 5),
        description: '',
        coordinator: 'דנה כהן',
        participants: '',
        linkedTo: '',
        reminder: false,
        reminderTime: '15',
      });
    }
  }, [event, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    // @ts-ignore
    const checked = isCheckbox ? e.target.checked : undefined;
    setFormData(prev => ({ ...prev, [name]: isCheckbox ? checked : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const [year, month, day] = formData.date.split('-').map(Number);
    const [hours, minutes] = formData.time.split(':').map(Number);
    const date = new Date(year, month - 1, day, hours, minutes).toISOString();

    onSave({
      id: event?.id,
      title: formData.title,
      type: formData.type,
      date: date,
      description: formData.description,
      coordinator: formData.coordinator,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <header className="flex items-center justify-between p-4 border-b border-border-default">
            <h2 className="text-xl font-bold text-text-default">{event ? 'עריכת אירוע' : 'יצירת אירוע חדש'}</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>
          
          <main className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">כותרת אירוע</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">סוג אירוע</label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                  <option>פגישה</option>
                  <option>ראיון</option>
                  <option>תזכורת</option>
                  <option>משימת מערכת</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">תאריך</label>
                <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">שעה</label>
                <input type="time" name="time" value={formData.time} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1">תיאור האירוע</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5"></textarea>
            </div>
            {context === 'candidate' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1">רכז אחראי</label>
                    <select name="coordinator" value={formData.coordinator} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                        <option>דנה כהן</option>
                        <option>אביב לוי</option>
                        <option>יעל שחר</option>
                    </select>
                </div>
                <div>
                     <label className="block text-sm font-semibold text-text-muted mb-1">קישור לאובייקט (משרה/מועמד/לקוח)</label>
                    <input type="text" name="linkedTo" value={formData.linkedTo} onChange={handleChange} placeholder="התחל להקליד כדי לחפש..." className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                </div>
            </div>
            )}
            <div className="flex items-center gap-4 pt-2">
                 <label htmlFor="reminder" className="flex items-center gap-2 text-sm font-semibold text-text-muted cursor-pointer">
                    <input type="checkbox" id="reminder" name="reminder" checked={formData.reminder} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500" />
                    תזכורת
                </label>
                {formData.reminder && (
                    <div className="flex items-center gap-2">
                         <select name="reminderTime" value={formData.reminderTime} onChange={handleChange} className="bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                            <option value="15">15 דקות לפני</option>
                            <option value="30">30 דקות לפני</option>
                            <option value="60">שעה לפני</option>
                         </select>
                    </div>
                )}
            </div>
          </main>

          <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
            <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
            <button type="submit" className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2">שמור אירוע</button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default EventFormModal;