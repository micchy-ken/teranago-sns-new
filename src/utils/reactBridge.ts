import * as React from 'react';

/**
 * React 19 において Vite 開発サーバーの依存最適化更新（browserHash更新）や
 * 動的インポート（React.lazy）時に別チャンクの React がロードされた場合でも、
 * React 内部のフックディスパッチャー（ReactSharedInternals）をグローバルで共有・同期し、
 * 「Invalid hook call」「Cannot read properties of null (reading 'useState')」
 * を根本的・確実に防止するブリッジユーティリティ
 */

const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null)) as any;

export function syncReactInternals(): void {
  if (!g) return;

  // グローバルに React インスタンスを確保
  if (!g.__GLOBAL_REACT__) {
    g.__GLOBAL_REACT__ = React;
  }

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) return;

  if (!g.__REACT_INTERNALS_PROXY__) {
    g.__REACT_INTERNALS_PROXY__ = {
      H: internals.H,
      A: internals.A,
      T: internals.T,
      S: internals.S,
    };
  }

  // H (Hooks Dispatcher), A (Async Dispatcher), T (Transition), S
  const props = ['H', 'A', 'T', 'S'];
  for (const prop of props) {
    const desc = Object.getOwnPropertyDescriptor(internals, prop);
    // まだプロキシ化されていない場合
    if (!desc || desc.configurable) {
      if (internals[prop] !== null && internals[prop] !== undefined) {
        g.__REACT_INTERNALS_PROXY__[prop] = internals[prop];
      }
      try {
        Object.defineProperty(internals, prop, {
          get() {
            return g.__REACT_INTERNALS_PROXY__[prop];
          },
          set(val) {
            g.__REACT_INTERNALS_PROXY__[prop] = val;
          },
          configurable: true,
          enumerable: true,
        });
      } catch {
        // ignore if not configurable
      }
    }
  }
}

// モジュール評価時に即時同期
syncReactInternals();
