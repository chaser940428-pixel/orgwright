import type React from 'react';

/**
 * Keyboard handler for an ARIA tablist: Left/Right (and Home/End) move between tabs and activate them.
 * Put it on the element with role="tablist"; tabs need role="tab".
 */
export function onTabListKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  if (tabs.length === 0) return;
  const current = tabs.findIndex((t) => t === document.activeElement);
  let next = current;
  if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = tabs.length - 1;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
