import { ChevronRightIcon, FolderIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { ReportArticle } from '../../types';
import { CardFormat } from './ReportHeader';
import { formatArticleDate } from '../../utils/dateUtils';
import StarButton from '../articles/StarButton';
import TagBadge from '../tags/TagBadge';
import { ArticleTag } from '../../types/tag';
import { getStanceInfo } from '../ui/StanceAnalysisDisplay';

// authors can come back as string, array, or null from backend JSON columns
function formatAuthors(authors: any): string {
    if (!authors) return '';
    if (typeof authors === 'string') return authors;
    if (Array.isArray(authors) && authors.length > 0) {
        const display = authors.slice(0, 3).join(', ');
        return authors.length > 3 ? display + ' et al.' : display;
    }
    return '';
}

export interface ReportArticleCardProps {
    article: ReportArticle;
    cardFormat?: CardFormat;
    onClick?: () => void;
    isStarred?: boolean;
    onToggleStar?: () => void;
    tags?: ArticleTag[];
    /** Show the source report name as a badge (used in favorites view) */
    showReportBadge?: boolean;
    /** Collection names this article belongs to */
    collections?: string[];
    /** Number of notes on this article */
    notesCount?: number;
}

export default function ReportArticleCard({
    article,
    cardFormat = 'compact',
    onClick,
    isStarred = false,
    onToggleStar,
    tags,
    showReportBadge = false,
    collections,
    notesCount,
}: ReportArticleCardProps) {
    return (
        <div
            onClick={onClick}
            className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-all ${
                onClick
                    ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
        >
            <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1 group-hover:underline">
                        {article.title}
                    </h4>
                    {article.authors && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {formatAuthors(article.authors)}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500">
                        {article.journal && <span>{article.journal}</span>}
                        {article.pub_year && (
                            <span>• {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
                        )}
                        {article.pmid && <span>• PMID: {article.pmid}</span>}
                    </div>
                    {tags && tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.map(tag => (
                                <TagBadge key={tag.tag_id} name={tag.name} color={tag.color} scope={tag.scope} />
                            ))}
                        </div>
                    )}
                    {/* Collection & notes indicators */}
                    {((collections && collections.length > 0) || (notesCount && notesCount > 0)) && (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {collections && collections.map(name => (
                                <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                                    <FolderIcon className="h-3 w-3" />
                                    {name}
                                </span>
                            ))}
                            {notesCount !== undefined && notesCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                    <ChatBubbleLeftIcon className="h-3 w-3" />
                                    {notesCount} note{notesCount !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    )}
                    {/* Report badge + stance (favorites context) */}
                    {(showReportBadge || article.ai_enrichments?.stance_analysis) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {showReportBadge && article.report_name && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                    {article.report_name}
                                </span>
                            )}
                            {article.ai_enrichments?.stance_analysis && (() => {
                                const stanceInfo = getStanceInfo(article.ai_enrichments!.stance_analysis!.stance);
                                const StanceIcon = stanceInfo.icon;
                                return (
                                    <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${stanceInfo.bgColor} ${stanceInfo.color}`}>
                                        <StanceIcon className="h-3 w-3" />
                                        {stanceInfo.label}
                                    </span>
                                );
                            })()}
                        </div>
                    )}
                    {cardFormat === 'ai_summary' && article.ai_summary && (
                        <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md border-l-2 border-purple-400 dark:border-purple-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.ai_summary}
                            </p>
                        </div>
                    )}
                    {cardFormat === 'ai_summary' && !article.ai_summary && article.abstract && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 italic">No AI summary available - showing abstract</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                    {cardFormat === 'abstract' && article.abstract && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                    {article.relevance_rationale && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
                            {article.relevance_rationale}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                    {onToggleStar && (
                        <StarButton
                            isStarred={isStarred}
                            onToggle={onToggleStar}
                            size="sm"
                        />
                    )}
                    {onClick && (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                </div>
            </div>
        </div>
    );
}
