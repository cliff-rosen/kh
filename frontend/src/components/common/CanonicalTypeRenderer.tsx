import React from 'react';
import { CanonicalType, CanonicalSearchResult, CanonicalEmail, CanonicalWebpage, CanonicalPubMedArticle, CanonicalNewsletter, CanonicalDailyNewsletterRecap } from '@/types/canonical_types';

interface CanonicalTypeRendererProps {
    data: any;
    type: CanonicalType;
    isArray?: boolean;
    className?: string;
}

export const CanonicalTypeRenderer: React.FC<CanonicalTypeRendererProps> = ({
    data,
    type,
    isArray = false,
    className = ''
}) => {
    // Handle array of canonical types
    if (isArray && Array.isArray(data)) {
        return (
            <div className={`space-y-3 ${className}`}>
                {data.map((item, index) => (
                    <CanonicalTypeRenderer
                        key={index}
                        data={item}
                        type={type}
                        isArray={false}
                        className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                ))}
            </div>
        );
    }

    // Render based on canonical type
    switch (type) {
        case 'search_result':
            return <SearchResultRenderer data={data as CanonicalSearchResult} className={className} />;
        case 'email':
            return <EmailRenderer data={data as CanonicalEmail} className={className} />;
        case 'webpage':
            return <WebpageRenderer data={data as CanonicalWebpage} className={className} />;
        case 'pubmed_article':
            return <PubMedArticleRenderer data={data as CanonicalPubMedArticle} className={className} />;
        case 'newsletter':
            return <NewsletterRenderer data={data as CanonicalNewsletter} className={className} />;
        case 'daily_newsletter_recap':
            return <DailyNewsletterRecapRenderer data={data as CanonicalDailyNewsletterRecap} className={className} />;
        default:
            return <div className={`text-gray-500 ${className}`}>Unknown canonical type: {type}</div>;
    }
};

// Individual renderers for each canonical type

const SearchResultRenderer: React.FC<{ data: CanonicalSearchResult; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                <a href={data.url} target="_blank" rel="noopener noreferrer">
                    {data.title}
                </a>
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">#{data.rank}</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{data.snippet}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{data.source}</span>
            {data.published_date && (
                <>
                    <span>•</span>
                    <span>{new Date(data.published_date).toLocaleDateString()}</span>
                </>
            )}
            {data.relevance_score && (
                <>
                    <span>•</span>
                    <span>Score: {(data.relevance_score * 100).toFixed(1)}%</span>
                </>
            )}
        </div>
    </div>
);

const EmailRenderer: React.FC<{ data: CanonicalEmail; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <div className="mb-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{data.subject}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">From: {data.sender}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">{new Date(data.timestamp).toLocaleString()}</p>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {data.body.length > 200 ? `${data.body.substring(0, 200)}...` : data.body}
        </div>
        {data.labels && data.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
                {data.labels.map((label, index) => (
                    <span key={index} className="inline-block px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        {label}
                    </span>
                ))}
            </div>
        )}
    </div>
);

const WebpageRenderer: React.FC<{ data: CanonicalWebpage; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <h3 className="font-medium text-blue-600 dark:text-blue-400 hover:underline mb-2">
            <a href={data.url} target="_blank" rel="noopener noreferrer">
                {data.title}
            </a>
        </h3>
        {data.metadata.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{data.metadata.description}</p>
        )}
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {data.content.length > 300 ? `${data.content.substring(0, 300)}...` : data.content}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {data.metadata.author && <span>By {data.metadata.author}</span>}
            {data.metadata.published_date && (
                <>
                    <span>•</span>
                    <span>{new Date(data.metadata.published_date).toLocaleDateString()}</span>
                </>
            )}
            {data.metadata.word_count && (
                <>
                    <span>•</span>
                    <span>{data.metadata.word_count} words</span>
                </>
            )}
        </div>
    </div>
);

const PubMedArticleRenderer: React.FC<{ data: CanonicalPubMedArticle; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <h3 className="font-medium text-blue-600 dark:text-blue-400 hover:underline mb-2">
            <a href={data.url} target="_blank" rel="noopener noreferrer">
                {data.title}
            </a>
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {data.authors.join(', ')} • {data.journal} • {new Date(data.publication_date).toLocaleDateString()}
        </p>
        {data.abstract && (
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                {data.abstract.length > 300 ? `${data.abstract.substring(0, 300)}...` : data.abstract}
            </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>PMID: {data.pmid}</span>
            {data.doi && (
                <>
                    <span>•</span>
                    <span>DOI: {data.doi}</span>
                </>
            )}
        </div>
        {data.keywords && data.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
                {data.keywords.slice(0, 5).map((keyword, index) => (
                    <span key={index} className="inline-block px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        {keyword}
                    </span>
                ))}
            </div>
        )}
    </div>
);

const NewsletterRenderer: React.FC<{ data: CanonicalNewsletter; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{data.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            From: {data.sender} • {new Date(data.received_date).toLocaleDateString()}
        </p>
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {data.content.length > 300 ? `${data.content.substring(0, 300)}...` : data.content}
        </div>
        {data.categories && data.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
                {data.categories.map((category, index) => (
                    <span key={index} className="inline-block px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                        {category}
                    </span>
                ))}
            </div>
        )}
        {data.metadata && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
                {data.metadata.word_count && <span>{data.metadata.word_count} words</span>}
                {data.metadata.read_time_minutes && (
                    <>
                        <span> • </span>
                        <span>{data.metadata.read_time_minutes} min read</span>
                    </>
                )}
                {data.metadata.sentiment_score && (
                    <>
                        <span> • </span>
                        <span>Sentiment: {(data.metadata.sentiment_score * 100).toFixed(1)}%</span>
                    </>
                )}
            </div>
        )}
    </div>
);

const DailyNewsletterRecapRenderer: React.FC<{ data: CanonicalDailyNewsletterRecap; className?: string }> = ({ data, className }) => (
    <div className={`${className}`}>
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
            Daily Newsletter Recap - {new Date(data.date).toLocaleDateString()}
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div>
                <span className="text-gray-600 dark:text-gray-400">Newsletters:</span>
                <span className="ml-2 font-medium">{data.newsletter_count}</span>
            </div>
            <div>
                <span className="text-gray-600 dark:text-gray-400">Total Words:</span>
                <span className="ml-2 font-medium">{data.total_word_count.toLocaleString()}</span>
            </div>
            <div>
                <span className="text-gray-600 dark:text-gray-400">Avg Sentiment:</span>
                <span className="ml-2 font-medium">{(data.average_sentiment * 100).toFixed(1)}%</span>
            </div>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {data.summary}
        </div>
        {data.top_categories && data.top_categories.length > 0 && (
            <div className="mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">Top Categories:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                    {data.top_categories.map((category, index) => (
                        <span key={index} className="inline-block px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                            {category}
                        </span>
                    ))}
                </div>
            </div>
        )}
        {data.key_topics && data.key_topics.length > 0 && (
            <div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Key Topics:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                    {data.key_topics.map((topic, index) => (
                        <span key={index} className="inline-block px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                            {topic}
                        </span>
                    ))}
                </div>
            </div>
        )}
    </div>
);

export default CanonicalTypeRenderer; 