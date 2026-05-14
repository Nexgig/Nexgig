# Nexgig DJ Management App - Design Document

## Overview
Nexgig is a dual-role mobile application for the UAE nightlife industry. It connects **Venue Managers** with **DJs** for booking and scheduling gigs. The app supports two distinct user experiences based on account type.

## Screen List

### Auth Screens
- **Welcome** - Landing page with role selection (Manager / DJ)
- **Sign In** - Email-based demo sign-in
- **Manager Register** - Multi-step manager registration (4 steps)
- **DJ Setup** - Multi-step DJ profile setup (4 steps)

### Manager Screens (Tabs)
- **Dashboard** - Overview with stats, upcoming bookings, quick actions
- **Venues** - List of managed venues with search/filter
- **Calendar** - Weekly calendar view of all slots across venues
- **Roster** - DJ roster management per venue
- **Profile** - Manager profile with settings

### Manager Detail Screens
- **Venue Detail** - Full venue info with tabs (overview, slots, roster)
- **Booking Detail** - Booking info with status management
- **Assign DJ** - Select and assign a DJ to a slot
- **Create Venue** - Multi-step venue creation wizard
- **DJ Profile View** - View a DJ's full profile
- **Notifications** - Notification center

### DJ Screens (Tabs)
- **Home** - Dashboard with upcoming gigs, recent activity
- **Bookings** - All bookings with status filters
- **Availability** - Manage availability blocks
- **Profile** - DJ profile with editable bio

### DJ Detail Screens
- **Booking Detail** - Accept/decline bookings
- **Notifications** - Notification center

## Color Choices
- **Primary (Navy):** #0A1628
- **Accent (Blue):** #2E75B6
- **Gold:** #D4A843
- **Background Light:** #F8F9FB
- **Background Dark:** #0A1628
- **Surface Light:** #FFFFFF
- **Surface Dark:** #132039

## Key User Flows

### Manager Flow
1. Welcome → Sign In / Register → Dashboard
2. Dashboard → Venues → Create Venue (3-step wizard)
3. Dashboard → Calendar → Assign DJ to Slot
4. Roster → Invite DJ → DJ accepts → Appears on roster

### DJ Flow
1. Welcome → Sign In / Setup → Home
2. Home → View Booking → Accept/Decline
3. Profile → Edit Bio → Save
4. Availability → Add Block → Saved
