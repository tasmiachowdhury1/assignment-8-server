
# StudioSpace Backend API 🚀

The StudioSpace backend is a RESTful API built with Node.js, Express.js, and MongoDB. It manages studio listings, user bookings, authentication, and booking operations.

## 🛠️ Technologies Used

- Node.js
- Express.js
- MongoDB
- JSON Web Token (JWT)
- Cookie Parser
- CORS
- dotenv
- JOSE

## ✨ Features

- RESTful API for studio management.
- Get all available studios.
- Get studio details by ID.
- Add new studio listings.
- Get studio listings by owner.
- Update studio information.
- Delete studio listings.
- Create studio bookings.
- Get user bookings.
- Confirm bookings.
- Complete bookings.
- Cancel bookings.
- Prevent overlapping confirmed bookings.
- JWT-based authentication.
- HTTPOnly cookie-based authentication.
- Protected API routes.
- MongoDB database integration.

## 📂 Project Structure

```text
server/
├── index.js
├── package.json
├── package-lock.json
├── .env
├── .gitignore
└── README.md
```

## ⚙️ Installation and Setup

### 1. Clone the Repository

```bash
git clone YOUR_BACKEND_GITHUB_REPOSITORY_URL
```

### 2. Navigate to the Backend Folder

```bash
cd YOUR_BACKEND_PROJECT_FOLDER
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the backend root directory.

```env
PORT=5000
MONGODB_URL=YOUR_MONGODB_CONNECTION_STRING
CLIENT_URL=YOUR_FRONTEND_URL
AUTH_URL=YOUR_BETTER_AUTH_URL
NODE_ENV=development
```

Add any other environment variables required by your actual server configuration.

### 5. Start the Backend Server

For development:

```bash
npm run dev
```

Or, if you do not have a development script:

```bash
node index.js
```

The server will run at:

```text
http://localhost:5000
```

## 🔗 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/studios` | Get all studios |
| GET | `/studios/:id` | Get studio details |
| POST | `/add-newstudio` | Add a new studio |
| GET | `/my-studios` | Get owner's studios |
| PATCH | `/studios/:id` | Update a studio |
| DELETE | `/studios/:id` | Delete a studio |
| POST | `/bookings` | Create a booking |
| GET | `/bookings` | Get user bookings |
| PATCH | `/bookings/:id/confirm` | Confirm a booking |
| PATCH | `/bookings/:id/complete` | Complete a booking |
| PATCH | `/bookings/:id/cancel` | Cancel a booking |

## 🔐 Security

- JWT verification for protected API operations.
- HTTPOnly authentication cookies.
- CORS configuration with frontend origin.
- Authenticated studio management.
- Protected booking operations.
- Booking conflict validation.

## 🚀 Deployment

The backend API is deployed separately from the Next.js frontend.

Configure the production environment variables on your hosting platform.

## 👨‍💻 Author

**Tasmia Chowdhury**

GitHub: https://github.com/tasmiachowdhury1/assignment-8-server

---

⭐ StudioSpace Backend API
