import React, { useState, useEffect } from 'react';
import { ExternalLink, Globe, Loader2, Link2, ImageOff } from 'lucide-react';
import { fetchOgpData, OgpData } from '../../utils/ogp';

interface RichLinkCardProps {
  url: string;
  className?: string;
  showToggle?: boolean;
}

export function RichLinkCard({ url, className = '', showToggle = true }: RichLinkCardProps) {
  const [ogp, setOgp] = useState<OgpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [asSimpleLink, setAsSimpleLink] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setImageError(false);

    fetchOgpData(url)
      .then((data) => {
        if (isMounted) {
          setOgp(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (asSimpleLink) {
    return (
      <div className={`inline-flex items-center gap-1.5 my-1 text-xs sm:text-sm ${className}`}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 hover:underline break-all font-semibold inline-flex items-center gap-1"
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          <span>{ogp?.title || url}</span>
        </a>
        {showToggle && (
          <button
            type="button"
            onClick={() => setAsSimpleLink(false)}
            className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1 cursor-pointer"
            title="リッチカード形式で表示"
          >
            [カード表示]
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`my-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-3 animate-pulse max-w-lg ${className}`}>
        <div className="w-16 h-16 bg-slate-200 rounded-lg shrink-0 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3 bg-slate-200 rounded w-3/4"></div>
          <div className="h-2.5 bg-slate-200 rounded w-full"></div>
          <div className="h-2 bg-slate-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const hostname = ogp?.hostname || (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const title = ogp?.title || hostname;
  const description = ogp?.description;
  const hasImage = Boolean(ogp?.image) && !imageError;

  return (
    <div className={`my-2 group relative block max-w-xl ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row items-stretch bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-indigo-300 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-150 text-left cursor-pointer no-underline"
      >
        {/* テキストコンテンツ */}
        <div className="flex-1 p-3 sm:p-3.5 flex flex-col justify-between min-w-0">
          <div>
            {/* サイト名・ファビコン */}
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-slate-500 truncate">
              {ogp?.favicon ? (
                <img
                  src={ogp.favicon}
                  alt=""
                  className="w-3.5 h-3.5 rounded-xs object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span className="truncate">{ogp?.siteName || hostname}</span>
            </div>

            {/* タイトル */}
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
              {title}
            </h4>

            {/* 説明文 */}
            {description && (
              <p className="mt-1 text-[11px] sm:text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* ドメイン / URL */}
          <div className="mt-2 pt-1.5 flex items-center gap-1 text-[10px] text-indigo-600 font-medium truncate">
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{hostname}</span>
            <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 shrink-0" />
          </div>
        </div>

        {/* サムネイル画像 */}
        {hasImage && (
          <div className="sm:w-36 sm:max-w-[35%] h-32 sm:h-auto bg-slate-100 shrink-0 relative overflow-hidden border-t sm:border-t-0 sm:border-l border-slate-100">
            <img
              src={ogp.image}
              alt={title}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}
      </a>

      {/* 通常リンク切替ボタン */}
      {showToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setAsSimpleLink(true);
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 bg-slate-800/80 hover:bg-slate-900 text-white rounded text-[10px] font-medium shadow-xs"
          title="通常テキストリンクで表示"
        >
          通常リンクに切替
        </button>
      )}
    </div>
  );
}
