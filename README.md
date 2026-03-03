# 🌸 FlowerProj — Jocery's Flower Shop

A full-stack e-commerce platform for a flower shop, featuring a customer-facing web application and an admin mobile dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend (Web)** | React 19, Vite 7, Bootstrap 5 |
| **Frontend (Admin)** | React Native, Expo SDK 49 |
| **Backend** | Supabase (Auth, Database, Storage, Edge Functions) |
| **Deployment** | Docker, Railway |
| **CI/CD** | GitHub Actions |

## Project Structure

```
FlowerProj/
├── web/                    # Customer-facing React web app
│   ├── src/
│   │   ├── pages/          # Page components (Shop, Checkout, Profile, etc.)
│   │   ├── components/     # Reusable UI components
│   │   ├── config/         # Supabase client configuration
│   │   ├── styles/         # CSS stylesheets
│   │   └── assets/         # Static images and assets
│   └── package.json
├── react-native-app/       # Admin mobile dashboard (Expo)
│   ├── src/
│   │   ├── screens/        # Screen components
│   │   ├── config/         # API and Supabase configuration
│   │   └── components/     # Shared components
│   └── package.json
├── supabase/               # Supabase Edge Functions
├── Dockerfile              # Production Docker image
├── railway.toml            # Railway deployment config
└── .github/workflows/      # CI/CD pipeline
```

## Getting Started

### Prerequisites
- Node.js 20+ (see `.nvmrc`)
- npm 9+
- Expo CLI (for mobile app)

### Web App

```bash
cd web
cp .env.example .env        # Add your Supabase credentials
npm install
npm run dev                 # Starts on http://localhost:5173
```

### Admin Mobile App

```bash
cd react-native-app
cp .env.example .env        # Add your Supabase credentials
npm install
npx expo start              # Scan QR code with Expo Go
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

## Deployment

The web app is containerized via Docker and deployed on Railway:

```bash
docker build -t flowerproj .
docker run -p 3000:3000 flowerproj
```

## CI/CD

GitHub Actions runs on every push and PR to `main`:
- **ESLint** — Catches code quality issues
- **Vite Build** — Ensures the production bundle compiles successfully

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
