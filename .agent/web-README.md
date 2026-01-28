# FlowerForge Web Application

React-based web application for the FlowerForge platform built with Vite.

## Tech Stack

- **Framework**: React 19.1.0
- **Build Tool**: Vite 7.2.4
- **Routing**: React Router DOM 7.9.6
- **Styling**: Bootstrap 5.3.8, Custom CSS
- **Icons**: React Icons, FontAwesome
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

The app will be available at `http://localhost:5173` (or another port if 5173 is in use).

### Build for Production

```bash
# Create production build
npm run build
```

The build output will be in the `dist/` folder.

### Preview Production Build

```bash
# Preview the production build locally
npm run preview
```

## Project Structure

```
web/
├── src/
│   ├── components/     # Reusable React components
│   ├── pages/          # Page components
│   ├── styles/         # CSS files
│   ├── utils/          # Utility functions
│   ├── config/         # Configuration files
│   ├── assets/         # Images and static assets
│   ├── App.jsx         # Main app component
│   ├── App.css         # App styles
│   ├── main.jsx        # Entry point
│   └── index.css       # Global styles
├── index.html          # HTML template
├── vite.config.js      # Vite configuration
├── eslint.config.js    # ESLint configuration
└── package.json        # Dependencies and scripts
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Features

- Flower customization and ordering
- User authentication
- Shopping cart
- Order tracking
- Wishlist management
- Special order requests
- Admin dashboard

## API Integration

The web app connects to the backend API. Configure the API endpoint in `src/config/api.js`.
