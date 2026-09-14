import { beforeEach, describe, expect, test } from 'bun:test';

import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { filterStaleRecentFiles, isFileMissingError } from '../fileMentionResults';

describe('fileMentionStaleFiles', () => {
  beforeEach(() => {
    useFilesViewTabsStore.setState({ byRoot: {}, activeRuntimeKey: 'runtime-test', runtimeSnapshots: {} });
    useFileSearchStore.setState({ cache: {}, cacheKeys: [], inFlight: {} });
  });

  describe('filterStaleRecentFiles', () => {
    test('preserves all items when stale set is empty', () => {
      const items = [
        { path: '/repo/a.ts', name: 'a.ts' },
        { path: '/repo/b.ts', name: 'b.ts' },
      ];
      expect(filterStaleRecentFiles(items, new Set())).toEqual(items);
    });

    test('excludes files present in the stale paths set', () => {
      const live = { path: '/repo/live.ts', name: 'live.ts' };
      const deleted = { path: '/repo/deleted.ts', name: 'deleted.ts' };
      const renamed = { path: '/repo/renamed-old.ts', name: 'renamed-old.ts' };

      const stale = new Set(['/repo/deleted.ts', '/repo/renamed-old.ts']);
      const filtered = filterStaleRecentFiles([live, deleted, renamed], stale);

      expect(filtered).toEqual([live]);
    });
  });

  describe('isFileMissingError', () => {
    test('identifies missing file error messages', () => {
      expect(isFileMissingError(new Error('ENOENT: no such file or directory, stat \'/repo/test.md\''))).toBe(true);
      expect(isFileMissingError(new Error('File not found'))).toBe(true);
      expect(isFileMissingError(new Error('The specified file does not exist'))).toBe(true);
      expect(isFileMissingError({ message: 'Error: ENOENT' })).toBe(true);
    });

    test('does not misclassify unrelated errors', () => {
      expect(isFileMissingError(new Error('EACCES: permission denied'))).toBe(false);
      expect(isFileMissingError(new Error('Request timed out'))).toBe(false);
    });
  });

  describe('tabs store stale path pruning', () => {
    test('prunes missing recent file path from openPaths', () => {
      const root = '/repo';
      const store = useFilesViewTabsStore.getState();

      store.addOpenPath(root, '/repo/exists.ts');
      store.addOpenPath(root, '/repo/deleted.ts');
      expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toContain('/repo/deleted.ts');

      store.removeOpenPathsByPrefix(root, '/repo/deleted.ts');
      expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).not.toContain('/repo/deleted.ts');
      expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toContain('/repo/exists.ts');
    });
  });

  describe('search cache invalidation on autocomplete open', () => {
    test('clears directory search cache when invalidateDirectory is called', () => {
      const store = useFileSearchStore.getState();
      const dir = '/repo';
      const cacheKey = JSON.stringify(['runtime-test', dir, 'test', 60, false, true, 'file']);

      useFileSearchStore.setState({
        cache: {
          [cacheKey]: {
            files: [{ path: '/repo/old.ts', name: 'old.ts', relativePath: 'old.ts' }],
            timestamp: Date.now(),
          },
        },
        cacheKeys: [cacheKey],
      });

      expect(useFileSearchStore.getState().cache[cacheKey]).toBeDefined();

      store.invalidateDirectory(dir);

      expect(useFileSearchStore.getState().cache[cacheKey]).toBeUndefined();
      expect(useFileSearchStore.getState().cacheKeys).toHaveLength(0);
    });
  });
});
