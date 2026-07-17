import { describe, it, expect } from 'vitest';
import {
  extractYouTubeVideoId,
  isYouTubeWatchUrl,
  isInputFocused,
  hasModifierKey,
  isMatchingVideoCardSelector,
} from './capture-predicates';

describe('Capture Predicates', () => {
  describe('extractYouTubeVideoId', () => {
    it('extracts video id from full watch URL', () => {
      expect(
        extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      ).toBe('dQw4w9WgXcQ');
      expect(
        extractYouTubeVideoId('https://youtube.com/watch?v=abc123_XYZ8&t=42s')
      ).toBe('abc123_XYZ8');
    });

    it('extracts video id from relative watch URL', () => {
      expect(extractYouTubeVideoId('/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts video id from short url (youtu.be)', () => {
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('returns null for non-watch URLs', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull();
      expect(extractYouTubeVideoId('https://example.com')).toBeNull();
      expect(extractYouTubeVideoId('')).toBeNull();
    });
  });

  describe('isYouTubeWatchUrl', () => {
    it('returns true for valid watch URLs', () => {
      expect(isYouTubeWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isYouTubeWatchUrl('/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('returns false for non-watch URLs', () => {
      expect(isYouTubeWatchUrl('https://www.youtube.com/channel/123')).toBe(false);
    });
  });

  describe('isInputFocused', () => {
    it('returns true for INPUT, TEXTAREA, or contentEditable', () => {
      expect(isInputFocused('INPUT', false)).toBe(true);
      expect(isInputFocused('input', false)).toBe(true);
      expect(isInputFocused('TEXTAREA', false)).toBe(true);
      expect(isInputFocused('DIV', true)).toBe(true);
    });

    it('returns false for non-input elements', () => {
      expect(isInputFocused('DIV', false)).toBe(false);
      expect(isInputFocused('BODY', false)).toBe(false);
      expect(isInputFocused('YTD-RICH-ITEM-RENDERER', false)).toBe(false);
    });
  });

  describe('hasModifierKey', () => {
    it('returns true if metaKey, ctrlKey, or altKey is pressed', () => {
      expect(hasModifierKey({ metaKey: true, ctrlKey: false, altKey: false })).toBe(true);
      expect(hasModifierKey({ metaKey: false, ctrlKey: true, altKey: false })).toBe(true);
      expect(hasModifierKey({ metaKey: false, ctrlKey: false, altKey: true })).toBe(true);
    });

    it('returns false when no modifier keys are pressed', () => {
      expect(hasModifierKey({ metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    });
  });

  describe('isMatchingVideoCardSelector', () => {
    it('returns true for valid YouTube video card tag names / selectors', () => {
      expect(isMatchingVideoCardSelector('ytd-rich-item-renderer')).toBe(true);
      expect(isMatchingVideoCardSelector('YTD-VIDEO-RENDERER')).toBe(true);
      expect(isMatchingVideoCardSelector('ytd-grid-video-renderer')).toBe(true);
      expect(isMatchingVideoCardSelector('ytd-compact-video-renderer')).toBe(true);
    });

    it('returns false for unrelated tag names', () => {
      expect(isMatchingVideoCardSelector('ytd-app')).toBe(false);
      expect(isMatchingVideoCardSelector('div')).toBe(false);
    });
  });
});
