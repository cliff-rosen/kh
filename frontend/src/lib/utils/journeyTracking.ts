/**
 * Journey Tracking Utilities
 *
 * Utilities for managing user journey tracking in SmartSearch2
 */

import { v4 as uuidv4 } from 'uuid';

export interface JourneyInfo {
  journeyId: string;
  startedAt: string;
  source?: string;
  initialQuery?: string;
}

/**
 * Start a new user journey
 */
export function startNewJourney(source?: string, initialQuery?: string): string {
  const journeyId = uuidv4();
  const journeyInfo: JourneyInfo = {
    journeyId,
    startedAt: new Date().toISOString(),
    source,
    initialQuery
  };

  // Store in localStorage
  localStorage.setItem('currentJourneyId', journeyId);
  localStorage.setItem('currentJourneyInfo', JSON.stringify(journeyInfo));

  console.log('Started new journey:', journeyId);
  return journeyId;
}

/**
 * Get the current journey ID (creates one if it doesn't exist)
 */
export function getCurrentJourneyId(): string {
  let journeyId = localStorage.getItem('currentJourneyId');

  if (!journeyId) {
    // Auto-create a new journey if none exists
    journeyId = startNewJourney('auto', 'Auto-created');
    console.log('Auto-created new journey:', journeyId);
  }

  return journeyId;
}

/**
 * Get current journey info
 */
export function getCurrentJourneyInfo(): JourneyInfo | null {
  const info = localStorage.getItem('currentJourneyInfo');
  return info ? JSON.parse(info) : null;
}

/**
 * Clear current journey (when user starts fresh)
 */
export function clearCurrentJourney(): void {
  localStorage.removeItem('currentJourneyId');
  localStorage.removeItem('currentJourneyInfo');
  console.log('Cleared current journey');
}

/**
 * Update journey info
 */
export function updateJourneyInfo(updates: Partial<JourneyInfo>): void {
  const currentInfo = getCurrentJourneyInfo();
  if (currentInfo) {
    const updatedInfo = { ...currentInfo, ...updates };
    localStorage.setItem('currentJourneyInfo', JSON.stringify(updatedInfo));
  }
}

/**
 * Check if there's an active journey (without creating one)
 */
export function hasActiveJourney(): boolean {
  return localStorage.getItem('currentJourneyId') !== null;
}