/**
 * Controls - Coordinate tracking - Spots (overlay markers) management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useComposer } from '../../admin/composables/useComposer';

describe('useComposer', () => {
  let composer: ReturnType<typeof useComposer>;

  beforeEach(() => {
    composer = useComposer();
    // Reset to defaults
    composer.setZoom(100);
    composer.setCoords(0, 0);
    composer.removeSpots();
  });

  describe('Zoom functionality', () => {
    it('should initialize with default zoom of 100', () => {
      expect(composer.zoom.value).toBe(100);
    });

    it('should set zoom to a valid value', () => {
      composer.setZoom(150);
      expect(composer.zoom.value).toBe(150);
    });

    it('should clamp zoom to minimum of 10', () => {
      composer.setZoom(5);
      expect(composer.zoom.value).toBe(10);
    });

    it('should clamp zoom to maximum of 200', () => {
      composer.setZoom(250);
      expect(composer.zoom.value).toBe(200);
    });

    it('should increase zoom by 10 with zoomIn()', () => {
      composer.setZoom(100);
      composer.zoomIn();
      expect(composer.zoom.value).toBe(110);
    });

    it('should decrease zoom by 10 with zoomOut()', () => {
      composer.setZoom(100);
      composer.zoomOut();
      expect(composer.zoom.value).toBe(90);
    });

    it('should not exceed max zoom when zooming in', () => {
      composer.setZoom(195);
      composer.zoomIn();
      expect(composer.zoom.value).toBe(200);
    });

    it('should not go below min zoom when zooming out', () => {
      composer.setZoom(15);
      composer.zoomOut();
      expect(composer.zoom.value).toBe(10);
    });

    it('should calculate zoomDecimal correctly', () => {
      composer.setZoom(150);
      expect(composer.zoomDecimal.value).toBe(1.5);
    });

    it('should calculate zoomMultiplier correctly', () => {
      composer.setZoom(150);
      expect(composer.zoomMultiplier.value).toBeCloseTo(0.6667, 4);
    });
  });

  describe('Coordinate tracking', () => {
    it('should initialize with coords at origin', () => {
      expect(composer.coords.value).toEqual({ x: 0, y: 0 });
    });

    it('should update coords with setCoords()', () => {
      composer.setCoords(100, 200);
      expect(composer.coords.value).toEqual({ x: 100, y: 200 });
    });

    it('should handle negative coordinates', () => {
      composer.setCoords(-50, -75);
      expect(composer.coords.value).toEqual({ x: -50, y: -75 });
    });
  });

  describe('Spots management', () => {
    it('should initialize with empty spots array', () => {
      expect(composer.spots.value).toEqual([]);
    });

    it('should add a spot with default values', () => {
      const spot = composer.addSpot({ type: 'select' });

      expect(composer.spots.value).toHaveLength(1);
      expect(spot.type).toBe('select');
      expect(spot.x).toBe(0);
      expect(spot.y).toBe(0);
      expect(spot.width).toBe(0);
      expect(spot.height).toBe(0);
      expect(spot.id).toBeTruthy();
    });

    it('should add a spot with custom values', () => {
      const spot = composer.addSpot({
        type: 'hover',
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      });

      expect(spot.type).toBe('hover');
      expect(spot.x).toBe(100);
      expect(spot.y).toBe(200);
      expect(spot.width).toBe(300);
      expect(spot.height).toBe(400);
    });

    it('should add multiple spots', () => {
      composer.addSpot({ type: 'select' });
      composer.addSpot({ type: 'hover' });
      composer.addSpot({ type: 'target' });

      expect(composer.spots.value).toHaveLength(3);
    });

    it('should generate unique IDs for each spot', () => {
      const spot1 = composer.addSpot({ type: 'select' });
      const spot2 = composer.addSpot({ type: 'select' });

      expect(spot1.id).not.toBe(spot2.id);
    });

    it('should support all spot types', () => {
      const selectSpot = composer.addSpot({ type: 'select' });
      const hoverSpot = composer.addSpot({ type: 'hover' });
      const targetSpot = composer.addSpot({ type: 'target' });

      expect(selectSpot.type).toBe('select');
      expect(hoverSpot.type).toBe('hover');
      expect(targetSpot.type).toBe('target');
    });

    it('should remove a specific spot by ID', () => {
      const spot1 = composer.addSpot({ type: 'select' });
      const spot2 = composer.addSpot({ type: 'hover' });

      composer.removeSpots(spot1.id);

      expect(composer.spots.value).toHaveLength(1);
      expect(composer.spots.value[0].id).toBe(spot2.id);
    });

    it('should remove all spots when called without ID', () => {
      composer.addSpot({ type: 'select' });
      composer.addSpot({ type: 'hover' });
      composer.addSpot({ type: 'target' });

      composer.removeSpots();

      expect(composer.spots.value).toEqual([]);
    });

    it('should not error when removing non-existent spot', () => {
      composer.addSpot({ type: 'select' });

      expect(() => {
        composer.removeSpots('non-existent-id');
      }).not.toThrow();

      expect(composer.spots.value).toHaveLength(1);
    });
  });

  describe('resetView', () => {
    it('should reset zoom and coords to defaults', () => {
      composer.setZoom(150);
      composer.setCoords(100, 200);

      composer.resetView();

      expect(composer.zoom.value).toBe(100);
      expect(composer.coords.value).toEqual({ x: 0, y: 0 });
    });

    it('should not affect spots when resetting view', () => {
      composer.addSpot({ type: 'select' });
      composer.setZoom(150);

      composer.resetView();

      expect(composer.spots.value).toHaveLength(1);
    });
  });

  describe('Reactivity', () => {
    it('should make zoom reactive', () => {
      const values: number[] = [];

      // Watch zoom changes (simplified - in real tests you'd use Vue's watch)
      const initialZoom = composer.zoom.value;
      values.push(initialZoom);

      composer.setZoom(150);
      values.push(composer.zoom.value);

      expect(values).toEqual([100, 150]);
    });

    it('should make coords reactive', () => {
      const initial = { ...composer.coords.value };
      composer.setCoords(50, 75);
      const updated = { ...composer.coords.value };

      expect(initial).toEqual({ x: 0, y: 0 });
      expect(updated).toEqual({ x: 50, y: 75 });
    });

    it('should make spots reactive', () => {
      expect(composer.spots.value).toHaveLength(0);

      composer.addSpot({ type: 'select' });
      expect(composer.spots.value).toHaveLength(1);

      composer.removeSpots();
      expect(composer.spots.value).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle floating point zoom values', () => {
      composer.setZoom(123.456);
      expect(composer.zoom.value).toBe(123.456);
    });

    it('should handle very large coordinate values', () => {
      composer.setCoords(999999, -999999);
      expect(composer.coords.value).toEqual({ x: 999999, y: -999999 });
    });

    it('should handle rapid zoom changes', () => {
      composer.setZoom(50);
      composer.setZoom(150);
      composer.setZoom(100);
      composer.setZoom(200);
      composer.setZoom(10);

      expect(composer.zoom.value).toBe(10);
    });

    it('should handle adding many spots', () => {
      for (let i = 0; i < 100; i++) {
        composer.addSpot({ type: 'select' });
      }

      expect(composer.spots.value).toHaveLength(100);
    });
  });

  describe('Computed properties', () => {
    it('should update zoomDecimal when zoom changes', () => {
      composer.setZoom(100);
      expect(composer.zoomDecimal.value).toBe(1);

      composer.setZoom(50);
      expect(composer.zoomDecimal.value).toBe(0.5);

      composer.setZoom(200);
      expect(composer.zoomDecimal.value).toBe(2);
    });

    it('should update zoomMultiplier when zoom changes', () => {
      composer.setZoom(100);
      expect(composer.zoomMultiplier.value).toBe(1);

      composer.setZoom(50);
      expect(composer.zoomMultiplier.value).toBe(2);

      composer.setZoom(200);
      expect(composer.zoomMultiplier.value).toBe(0.5);
    });
  });
});
