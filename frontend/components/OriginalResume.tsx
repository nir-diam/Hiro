import React from 'react';

const OriginalResume: React.FC<{ highlighted?: boolean }> = ({ highlighted = false }) => {
    const Highlight: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = 'yellow'}) => {
        if (!highlighted) return <>{children}</>;
        const colorVariants: {[key: string]: string} = {
            yellow: 'bg-yellow-200 text-yellow-800',
            purple: 'bg-primary-200 text-primary-800',
            indigo: 'bg-secondary-200 text-secondary-800',
        }
        return <span className={`${colorVariants[color]}`}>{children}</span>;
    }

    return (
        <div className="p-4 bg-bg-card border border-border-default font-serif text-text-default" style={{direction: 'rtl'}}>
            <h3 className="text-xl font-bold mb-4 text-center">סלבה דולזארב</h3>
            <div className="text-center text-sm mb-6 border-b border-border-default pb-4 text-text-muted">
                <p>כתובת: כרמיאל | טלפון: 054-7526722 | דוא"ל: ani190@walla.com</p>
                <p>תעודת זהות: 303830756 | מצב משפחתי: נשוי +2 | רישיון נהיגה: פרטי</p>
            </div>

            <div className="space-y-6">
                <div>
                    <h4 className="text-lg font-bold mb-3 border-b-2 border-text-muted inline-block">השכלה</h4>
                    <ul className="list-none space-y-2 text-sm">
                        <li>•<span className="font-bold mx-2">2017-2020</span> <Highlight>הנדסאי מכונות בהתמחות ייצור</Highlight> - מכללת עתיד, מעלות.</li>
                        <li>•<span className="font-bold mx-2">2019</span> קורס מבקרים פנימיים מטעם אלביט מערכות.</li>
                        <li>•<span className="font-bold mx-2">2013</span> קורס <Highlight color="purple">הנדסת איכות</Highlight> משולבת - אורט בראודה.</li>
                        <li>•<span className="font-bold mx-2">2005</span> בגרות מלאה, מגמת C.N.C תיכון "עתיד", מעלות.</li>
                    </ul>
                </div>

                <div>
                    <h4 className="text-lg font-bold mb-3 border-b-2 border-text-muted inline-block">ניסיון תעסוקתי</h4>
                    <ul className="list-none space-y-4 text-sm">
                        <li>
                            <p>•<span className="font-bold mx-2">2023 - הווה:</span> <Highlight color="indigo">מבקר איכות</Highlight>, ת.א.ג מדיקל.</p>
                            <ul className="list-disc list-inside pr-8 mt-1 space-y-1">
                                <li>בקרת איכות של מוצרים רפואיים.</li>
                                <li>עבודה עם מערכות ERP ויישום ושיפור תהליכי.</li>
                            </ul>
                        </li>
                         <li>
                            <p>•<span className="font-bold mx-2">2020-2023:</span> אחראי משמרת, אלפא קוסמטיקה.</p>
                             <ul className="list-disc list-inside pr-8 mt-1">
                                <li>ניהול צוות עובדים במשמרת.</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default OriginalResume;