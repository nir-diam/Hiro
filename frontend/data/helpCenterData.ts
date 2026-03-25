/** Help center item as returned by GET /api/help-center/articles (flat list) */
export interface HelpArticle {
    id: string;
    parentId: string | null;
    title: string;
    type: 'folder' | 'article';
    content?: string;
    videoUrl?: string;
    order: number;
    /** Legacy / nested UI only — API returns a flat list */
    children?: HelpArticle[];
    createdAt?: string;
    updatedAt?: string;
}
