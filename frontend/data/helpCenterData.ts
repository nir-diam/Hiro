
export interface HelpArticle {
    id: string;
    parentId: string | null;
    title: string;
    type: 'folder' | 'article';
    content?: string;
    videoUrl?: string; // YouTube/Vimeo/MP4
    order: number;
    children?: HelpArticle[]; // For recursive rendering
}

export const initialHelpData: HelpArticle[] = [
    {
        id: '1',
        parentId: null,
        title: 'הקמה ראשונית של המערכת',
        type: 'folder',
        order: 1,
        content: '',
        children: []
    },
    {
        id: '1-1',
        parentId: '1',
        title: 'התחברות והגדרת פרופיל',
        type: 'article',
        order: 1,
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Example placeholder
        content: `
        <p>ברוכים הבאים ל-Hiro! כדי להתחיל לעבוד, עליכם להגדיר את הפרופיל האישי שלכם.</p>
        <p><strong>שלבים:</strong></p>
        <ol>
            <li>לחצו על תמונת הפרופיל בפינה העליונה.</li>
            <li>בחרו ב"הגדרות משתמש".</li>
            <li>מלאו את פרטי ההתקשרות והוסיפו חתימה למייל.</li>
        </ol>
        `
    },
    {
        id: '1-2',
        parentId: '1',
        title: 'הוספת רכזים חדשים',
        type: 'article',
        order: 2,
        content: 'הסבר על ניהול הרשאות והוספת משתמשים לצוות.'
    },
    {
        id: '2',
        parentId: null,
        title: 'ניהול משרות',
        type: 'folder',
        order: 2,
        children: []
    },
    {
        id: '2-1',
        parentId: '2',
        title: 'איך ליצור משרה חדשה?',
        type: 'article',
        order: 1,
        videoUrl: '',
        content: 'מדריך מפורט על אשף יצירת המשרה והשימוש ב-AI לניתוח התיאור.'
    },
    {
        id: '3',
        parentId: null,
        title: 'שאלות ותשובות (FAQ)',
        type: 'folder',
        order: 3,
        children: []
    }
];
