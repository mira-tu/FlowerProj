# FlowerForge Platform

A comprehensive flower shop platform with web, mobile, and backend services.

## Project Structure

```
FinalFlower/
├── backend/              # Node.js/Express API server
├── react-native-app/     # React Native mobile application
├── web/                  # React web application (Vite)
└── Architecture/         # Database schema and architecture documentation
```

## Getting Started

Each project has its own setup instructions:

- **[Backend Setup](./backend/README.md)** - API server and database
- **[Mobile App Setup](./react-native-app/README.md)** - React Native app
- **[Web App Setup](./web/README.md)** - React web frontend

## Quick Start

### Backend API
```bash
cd backend
npm install
node server.js
```

### Web Application
```bash
cd web
npm install
npm run dev
```

### Mobile Application
```bash
cd react-native-app
npm install
npx expo start
```

## Technology Stack

- **Backend**: Node.js, Express, MySQL
- **Web**: React, Vite, React Router
- **Mobile**: React Native, Expo
- **Shared**: Axios for API calls

## Documentation

- Database schema and architecture docs: `Architecture/`
- Backend API documentation: `backend/README.md`
- Web app documentation: `web/README.md`
- Mobile app documentation: `react-native-app/README.md`
