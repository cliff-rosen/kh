# Unified Feature Management

## Overview

The feature management system has been unified into a single modal (`ManageCollectionFeaturesModal`) that handles all three core functions:

1. **Managing collection features** (add, edit, delete)
2. **Selecting which features to extract** 
3. **Targeting which articles** (selected vs all)

## User Interface

### Single Entry Point
- **Button**: "Manage Features" (replaces separate "Add Features" and "Extract Features" buttons)
- **Icon**: Settings icon for clear visual identification
- **Modal**: `ManageCollectionFeaturesModal` - comprehensive feature management interface

## Complete Workflow Matrix

| User Action | Modal Section | Extract Option | Target Articles | Result |
|-------------|---------------|----------------|-----------------|---------|
| Add from preset | Add New Features → Preset | ✅ Extract immediately | Selected/All | Add + Extract |
| Add from preset | Add New Features → Preset | ❌ Extract immediately | N/A | Add only |
| Add custom | Add New Features → Custom | ✅ Extract immediately | Selected/All | Add + Extract |
| Add custom | Add New Features → Custom | ❌ Extract immediately | N/A | Add only |
| Edit existing | Current Features → Edit | N/A | N/A | Update definition |
| Delete existing | Current Features → Delete | N/A | N/A | Remove from collection |
| Extract existing | Current Features → Select + Extract | Always extracts | Selected/All | Extract values |

## Article Targeting

**Automatic Scope Detection:**
- If articles are selected: Operations target only selected articles
- If no selection: Operations target all articles in collection
- Scope clearly displayed in modal header

## API Calls

### Handler Functions
- `handleOpenFeatureModal()` - Opens the unified modal
- `handleUpdateFeature()` - Updates existing feature definitions
- `handleFeatureAdd()` - Adds new features with optional extraction
- `handleFeatureExtract()` - Extracts selected existing features

### Context API Methods
- `addFeatureDefinitionsLocal()` - Add feature definitions only
- `addFeaturesAndExtract()` - Add features and extract values
- `extractFeatureValues()` - Extract values for existing features
- `removeFeatureDefinition()` - Delete feature from collection

## Code Architecture

### Components
- **Main Modal**: `ManageCollectionFeaturesModal.tsx`
  - Unified interface for all feature operations
  - Three main sections: Current Features, Add New Features, Extraction Controls
  - Supports editing, deletion, adding (preset/custom), and extraction

### Page Integration
- **Entry Point**: `WorkbenchPage.tsx::handleOpenFeatureModal()`
- **Collection Header**: Single "Manage Features" button
- **State Management**: Simplified to `showFeatureModal` and `featureModalCollectionType`

### Key Benefits
1. **Simplified UX**: Single button instead of multiple confusing options
2. **Comprehensive**: All feature operations in one place
3. **Flexible**: Supports any combination of management and extraction
4. **Clear Targeting**: Automatic article scope detection and display
5. **Consistent**: Unified naming and interaction patterns