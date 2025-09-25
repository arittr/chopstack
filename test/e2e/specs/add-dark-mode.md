# Add Dark Mode Support to Next.js App

## Overview

Add a complete dark mode implementation to the Next.js TypeScript starter project, including theme switching, persistence, and system preference detection.

## Requirements

### 1. Theme Context and Provider

- Create a ThemeContext using React Context API
- Implement ThemeProvider component with theme state management
- Support 'light', 'dark', and 'system' theme options
- Persist theme preference in localStorage

### 2. Theme Toggle Component

- Create a ThemeToggle component with accessible button
- Display current theme state with appropriate icons
- Support keyboard navigation and screen readers
- Position toggle in the header/navigation area

### 3. CSS Variables Implementation

- Define CSS custom properties for light and dark themes
- Update existing styles to use CSS variables for colors
- Ensure proper contrast ratios for accessibility
- Support smooth transitions between themes

### 4. System Preference Detection

- Detect user's system color scheme preference
- Automatically apply system preference when theme is set to 'system'
- Listen for system preference changes and update accordingly

### 5. Styling Updates

- Update the main layout components to support dark mode
- Ensure all text, backgrounds, and borders adapt to theme changes
- Maintain consistent visual hierarchy in both themes
- Test with existing components (buttons, links, etc.)

## Technical Implementation

- Use React Context for theme state management
- Leverage CSS custom properties for dynamic theming
- Implement proper TypeScript types for theme values
- Ensure no layout shift during theme transitions
- Follow accessibility best practices (WCAG guidelines)

## Acceptance Criteria

- [ ] Users can toggle between light, dark, and system themes
- [ ] Theme preference persists across browser sessions
- [ ] System theme detection works correctly
- [ ] All UI elements properly adapt to theme changes
- [ ] No visual glitches during theme transitions
- [ ] Theme toggle is accessible via keyboard and screen readers
- [ ] Performance impact is minimal (no unnecessary re-renders)
