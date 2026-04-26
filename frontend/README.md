# CommunityPulse Frontend

**Application Module:** User-Facing Interface  
**Framework:** Next.js 16.2.4  
**Status:** Production-Ready

---

## Overview

The CommunityPulse frontend is a modern, responsive web application providing two distinct user interfaces:

1. **Field Reporter Portal** (`/field`) - For community members to submit needs
2. **Volunteer Dashboard** (`/volunteer`) - For coordinators to manage and dispatch responses

---

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── layout.tsx          # Root layout & metadata
│   │   ├── page.tsx            # Home page
│   │   ├── login/              # Authentication pages
│   │   ├── signup/             # Registration
│   │   ├── field/              # Field reporter portal
│   │   └── volunteer/          # Volunteer dashboard
│   ├── components/             # Reusable React components
│   │   ├── auth/               # Authentication UI
│   │   ├── chat/               # Communication interface
│   │   ├── map/                # Geographic visualization
│   │   ├── status/             # Status tracking components
│   │   └── intake/             # Need submission forms
│   ├── hooks/                  # Custom React hooks
│   │   └── useRealtimeNeeds.ts # Firebase real-time data hook
│   └── lib/                    # Utilities and configuration
│       ├── firebase.ts         # Firebase initialization
│       ├── auth-context.tsx    # Authentication context
│       └── utils.ts            # Helper functions
├── public/                     # Static assets
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

---

## Dependencies

### Production

- **next** (16.2.4): React framework with SSR/SSG
- **react** (19.2.4): UI library
- **typescript** (5.x): Type safety
- **firebase** (12.12.0): Real-time database & authentication
- **react-leaflet** (5.0.0): Interactive maps
- **framer-motion** (12.38.0): Animation library
- **tailwindcss** (4.0): Utility-first CSS framework
- **lucide-react** (1.8.0): Icon library
- **next-themes** (0.4.6): Theme management

### Development

- **eslint** (9.x): Code linting
- **@tailwindcss/postcss** (4.x): Tailwind processing

---

## Getting Started

### Installation

```bash
npm install
```

### Environment Configuration

Create `.env.local` in the frontend directory with the following variables:

```env
# Firebase Configuration (obtain from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=<your_api_key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your_auth_domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your_project_id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your_storage_bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your_messaging_sender_id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your_app_id>
NEXT_PUBLIC_FIREBASE_DATABASE_URL=<your_realtime_database_url>

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Development

```bash
npm run dev
```

Application will be available at `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

---

## Key Features

### Authentication Module

- Email/password registration with verification
- Google OAuth single sign-on
- Role-based access (Field Reporter vs. Volunteer)
- Volunteer access protected by 4-digit tactical code
- Session persistence via Firebase Auth

### Field Reporter Interface

- Real-time need submission form
- Location picker (GPS or manual entry)
- Status tracking dashboard showing submission history
- Multi-domain support (human needs, animal welfare)
- Response notification system

### Volunteer Dashboard

- Real-time incoming needs list with urgency scoring
- Interactive map showing need locations
- Volunteer position tracking
- Priority sorting based on AI urgency assessment
- Status update interface for dispatch and resolution
- Communication log

### Real-time Synchronization

- Firebase Realtime Database integration for live updates
- Automatic UI refresh on data changes
- Optimistic updates for better UX
- Offline support with sync on reconnection

---

## Component Documentation

### Core Components

#### `GlobalNav` (GlobalNav.tsx)

Navigation bar component providing:

- Authentication state display
- Route navigation
- Mobile responsiveness

#### `AuthForm` (auth/AuthForm.tsx)

Unified authentication form supporting:

- Login/signup mode switching
- Email verification flow
- Tactical code input for volunteers
- Form validation and error handling

#### `ChatPanel` (chat/ChatPanel.tsx)

Communication interface for:

- Live message display
- Message input and submission
- User presence indicators

#### `FieldMap` (map/FieldMap.tsx)

Geographic visualization component with:

- Need location markers
- Volunteer position display
- Interactive popups
- Zoom and pan controls

#### `IntakeForm` (intake/IntakeForm.tsx)

Need submission form containing:

- Text description input
- Location picker (GPS/map)
- Domain selector (human/animal)
- Form validation

#### `StatusTracker` (status/StatusTracker.tsx)

Request status display showing:

- Submission timestamp
- Current status
- Last update information
- Status history

### Custom Hooks

#### `useRealtimeNeeds()`

Real-time data subscription hook providing:

- Active needs list
- Automatic updates on Firebase changes
- Error handling
- Loading states

---

## Styling & Theme

### Design System

- **Color Scheme**: High-contrast black/white for accessibility
- **Typography**: Anton (headings), Roboto (body)
- **Layout**: CSS Grid and Flexbox
- **Responsive**: Mobile-first design approach

### Tailwind Configuration

Custom Tailwind setup at `tailwind.config.ts`:

- Dark mode support
- Custom color palette
- Extended spacing and sizing
- Animation configurations

---

## Code Quality

### Linting

```bash
npm run lint
```

Configured via `eslint.config.mjs` with Next.js and TypeScript support.

### Type Safety

- Full TypeScript coverage
- Strict mode enabled in `tsconfig.json`
- Component prop typing
- API response typing

---

## API Integration

All backend communication goes through the Backend API (default: `http://localhost:8000`).

### Key Endpoints Used

- `POST /intake` - Submit field needs
- `POST /status/update` - Update need status
- `POST /notify/vapi` - Voice agent webhooks

See [backend/README.md](../backend/README.md) for complete API documentation.

---

## Performance Optimization

- Next.js automatic code splitting
- Image optimization via `next/image`
- Font optimization via `next/font`
- CSS tree-shaking with Tailwind
- Build-time optimization with Turbopack

---

## Security Considerations

- Environment variables for sensitive data (Firebase keys)
- CORS properly configured for backend communication
- Authentication state managed securely
- No sensitive data in browser storage (session tokens only)
- Firebase security rules enforce access control

---

## Troubleshooting

### Firebase Connection Issues

- Verify `NEXT_PUBLIC_FIREBASE_*` variables are set correctly
- Check Firebase project is active and RTDB enabled
- Verify CORS settings in Firebase

### Authentication Failures

- Ensure email verification is enabled in Firebase Auth
- Check backend is running for tactical code validation
- Verify Google OAuth credentials if using OAuth

### Map Display Issues

- Leaflet CSS may need explicit import
- Verify Leaflet library is properly installed
- Check browser console for warnings

---

## Development Guidelines

### Component Creation

- Use functional components with hooks
- Define prop types with TypeScript interfaces
- Include JSDoc comments for props
- Keep components focused and reusable

### State Management

- Use React hooks (useState, useContext)
- Prefer local state over global when possible
- Use Firebase for shared application state
- Use AuthContext for authentication state

### Testing Recommendations

- Unit tests for utility functions
- Integration tests for authentication flow
- E2E tests for critical user journeys
- Visual regression tests for UI components

---

## Deployment

### Vercel (Recommended)

```bash
# Connect GitHub repository to Vercel
# Environment variables are configured in Vercel dashboard
vercel deploy
```

### Other Platforms

For Docker, AWS, or other platforms:

1. Build: `npm run build`
2. Start: `npm start`
3. Ensure environment variables are set
4. Backend API endpoint must be reachable

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
