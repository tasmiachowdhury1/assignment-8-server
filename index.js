
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

const PORT = process.env.PORT || 5000;
const DATABASE_NAME = "studioSpace";
const COOKIE_NAME = "studio_token";

const AUTH_URL = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");

if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is missing from environment variables.");
}

if (!AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is missing from environment variables.");
}

// ==========================================
// CORS
// ==========================================

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""));

app.use(
    cors({
        origin(origin, callback) {
            // Allow requests without an Origin header (e.g. server-to-server).
            if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
                return callback(null, true);
            }

            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());

// ==========================================
// MONGODB CONNECTION
// ==========================================

const client = new MongoClient(process.env.MONGODB_URL);

let dbPromise;

async function connectDB(req, res, next) {
    try {
        if (!dbPromise) {
            dbPromise = client.connect();
        }

        await dbPromise;

        req.db = client.db(DATABASE_NAME);
        req.studiosCollection = req.db.collection("studios");
        req.bookingsCollection = req.db.collection("bookings");

        next();
    } catch (error) {
        console.error("MongoDB connection error:", error);
        res.status(500).json({
            success: false,
            message: "Database connection failed.",
        });
    }
}

app.use(connectDB);

// ==========================================
// JWT VERIFICATION
// ==========================================

const JWKS = createRemoteJWKSet(
    new URL(`${AUTH_URL}/api/auth/jwks`)
);

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
};

async function verifyJwtToken(token) {
    const { payload } = await jwtVerify(token, JWKS, {
        issuer: AUTH_URL,
        audience: AUTH_URL,
    });

    if (!payload.sub || !payload.email) {
        throw new Error("Invalid JWT payload.");
    }

    return {
        id: String(payload.sub),
        email: String(payload.email).trim().toLowerCase(),
    };
}

// ==========================================
// CREATE HTTPONLY AUTH COOKIE
// ==========================================

app.post("/auth/session", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token || typeof token !== "string") {
            return res.status(401).json({
                success: false,
                message: "Authentication token is required.",
            });
        }

        const user = await verifyJwtToken(token);

        res.cookie(COOKIE_NAME, token, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: "Authentication cookie created.",
            user,
        });
    } catch (error) {
        console.error("Session creation error:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token.",
        });
    }
});

// ==========================================
// CLEAR AUTH COOKIE
// ==========================================

app.delete("/auth/session", (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(200).json({
        success: true,
        message: "Authentication cookie cleared.",
    });
});

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

async function verifyToken(req, res, next) {
    try {
        const token = req.cookies?.[COOKIE_NAME];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please log in first.",
            });
        }

        req.user = await verifyJwtToken(token);

        next();
    } catch (error) {
        console.error("JWT verification error:", error);

        return res.status(401).json({
            success: false,
            message: "Unauthorized. Invalid or expired token.",
        });
    }
}

// ==========================================
// BASIC ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.send("StudioSpace server is running!");
});

// ==========================================
// ADD NEW STUDIO (PROTECTED)
// ==========================================

app.post("/add-newstudio", verifyToken, async (req, res) => {
    try {
        const {
            title,
            image,
            imageUrl,
            category,
            pricePerHour,
            rating,
            location,
            description,
            availability,
        } = req.body;

        if (!title || !category || !location || !pricePerHour) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required studio information.",
            });
        }

        const studio = {
            title,
            image: image || imageUrl || "",
            imageUrl: imageUrl || image || "",
            category,
            pricePerHour: Number(pricePerHour),
            rating: Number(rating) || 0,
            location,
            description: description || "",
            availability: availability || {},
            ownerEmail: req.user.email,
            userEmail: req.user.email,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await req.studiosCollection.insertOne(studio);

        return res.status(201).json({
            success: true,
            message: "Studio added successfully.",
            insertedId: result.insertedId,
            studio: {
                ...studio,
                _id: result.insertedId,
            },
        });
    } catch (error) {
        console.error("Add studio error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to add studio.",
        });
    }
});

// ==========================================
// GET ALL STUDIOS
// ==========================================

app.get("/studios", async (req, res) => {
    try {
        const studios = await req.studiosCollection
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        return res.status(200).json(studios);
    } catch (error) {
        console.error("Get studios error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get studios.",
        });
    }
});

// ==========================================
// GET MY STUDIOS
// ==========================================

app.get("/my-studios", async (req, res) => {
    try {
        const email = String(req.query.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required.",
            });
        }

        const studios = await req.studiosCollection
            .find({
                $or: [
                    { ownerEmail: email },
                    { userEmail: email },
                ],
            })
            .sort({ createdAt: -1 })
            .toArray();

        return res.status(200).json(studios);
    } catch (error) {
        console.error("Get my studios error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get your studios.",
        });
    }
});

// ==========================================
// GET FEATURED STUDIOS
// ==========================================

app.get("/featured-studios", async (req, res) => {
    try {
        const studios = await req.studiosCollection
            .find()
            .sort({ rating: -1 })
            .limit(6)
            .toArray();

        return res.status(200).json(studios);
    } catch (error) {
        console.error("Featured studios error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get featured studios.",
        });
    }
});

// ==========================================
// GET SINGLE STUDIO
// ==========================================

app.get("/studios/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const studio = await req.studiosCollection.findOne({
            _id: new ObjectId(id),
        });

        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found.",
            });
        }

        return res.status(200).json(studio);
    } catch (error) {
        console.error("Get single studio error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get studio.",
        });
    }
});

// ==========================================
// UPDATE STUDIO (PROTECTED)
// ==========================================

app.patch("/studios/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const allowedFields = [
            "title",
            "image",
            "imageUrl",
            "category",
            "pricePerHour",
            "rating",
            "location",
            "description",
            "availability",
        ];

        const updateData = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (updateData.pricePerHour !== undefined) {
            updateData.pricePerHour = Number(updateData.pricePerHour);
        }

        if (updateData.rating !== undefined) {
            updateData.rating = Number(updateData.rating);
        }

        updateData.updatedAt = new Date();

        const result = await req.studiosCollection.updateOne(
            {
                _id: new ObjectId(id),
                $or: [
                    { ownerEmail: req.user.email },
                    { userEmail: req.user.email },
                ],
            },
            {
                $set: updateData,
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Studio not found or you are not its owner.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Studio updated successfully.",
        });
    } catch (error) {
        console.error("Update studio error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update studio.",
        });
    }
});

// ==========================================
// DELETE STUDIO (PROTECTED)
// ==========================================

app.delete("/studios/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const result = await req.studiosCollection.deleteOne({
            _id: new ObjectId(id),
            $or: [
                { ownerEmail: req.user.email },
                { userEmail: req.user.email },
            ],
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Studio not found or you are not its owner.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Studio deleted successfully.",
        });
    } catch (error) {
        console.error("Delete studio error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete studio.",
        });
    }
});

// ==========================================
// CREATE BOOKING (PROTECTED)
// ==========================================

app.post("/bookings", verifyToken, async (req, res) => {
    try {
        const {
            studioId,
            userName,
            date,
            time,
            duration,
        } = req.body;

        if (!studioId || !date || !time || !duration) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required booking information.",
            });
        }

        if (!ObjectId.isValid(studioId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const bookingDuration = Number(duration);

        if (!Number.isFinite(bookingDuration) || bookingDuration <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking duration.",
            });
        }

        const studio = await req.studiosCollection.findOne({
            _id: new ObjectId(studioId),
        });

        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found.",
            });
        }

        const pricePerHour = Number(studio.pricePerHour);
        const totalPrice = pricePerHour * bookingDuration;

        const booking = {
            studioId: String(studio._id),
            studioTitle: studio.title,
            studioImage: studio.image || studio.imageUrl || "",
            category: studio.category,
            location: studio.location,
            userEmail: req.user.email,
            userName: userName || "",
            date,
            time,
            duration: bookingDuration,
            pricePerHour,
            totalPrice,
            status: "Pending",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await req.bookingsCollection.insertOne(booking);

        return res.status(201).json({
            success: true,
            message: "Booking created successfully.",
            insertedId: result.insertedId,
            booking: {
                ...booking,
                _id: result.insertedId,
            },
        });
    } catch (error) {
        console.error("Create booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create booking.",
        });
    }
});

// ==========================================
// GET BOOKINGS
// ==========================================

app.get("/bookings", async (req, res) => {
    try {
        const email = String(req.query.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required.",
            });
        }

        const bookings = await req.bookingsCollection
            .find({ userEmail: email })
            .sort({ createdAt: -1 })
            .toArray();

        return res.status(200).json(bookings);
    } catch (error) {
        console.error("Get bookings error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get bookings.",
        });
    }
});

// ==========================================
// CONFIRM BOOKING (HOST ONLY)
// ==========================================

app.patch("/bookings/:id/confirm", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(id),
            status: "Pending",
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Pending booking not found.",
            });
        }

        if (!ObjectId.isValid(booking.studioId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio reference.",
            });
        }

        const studio = await req.studiosCollection.findOne({
            _id: new ObjectId(booking.studioId),
            $or: [
                { ownerEmail: req.user.email },
                { userEmail: req.user.email },
            ],
        });

        if (!studio) {
            return res.status(403).json({
                success: false,
                message: "Only the studio owner can confirm this booking.",
            });
        }

        const result = await req.bookingsCollection.updateOne(
            {
                _id: new ObjectId(id),
                status: "Pending",
            },
            {
                $set: {
                    status: "Confirmed",
                    updatedAt: new Date(),
                },
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(409).json({
                success: false,
                message: "Booking status has already changed.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Booking confirmed successfully.",
        });
    } catch (error) {
        console.error("Confirm booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to confirm booking.",
        });
    }
});

// ==========================================
// COMPLETE BOOKING (HOST ONLY)
// ==========================================

app.patch("/bookings/:id/complete", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(id),
            status: "Confirmed",
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Confirmed booking not found.",
            });
        }

        if (!ObjectId.isValid(booking.studioId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio reference.",
            });
        }

        const studio = await req.studiosCollection.findOne({
            _id: new ObjectId(booking.studioId),
            $or: [
                { ownerEmail: req.user.email },
                { userEmail: req.user.email },
            ],
        });

        if (!studio) {
            return res.status(403).json({
                success: false,
                message: "Only the studio owner can complete this booking.",
            });
        }

        const result = await req.bookingsCollection.updateOne(
            {
                _id: new ObjectId(id),
                status: "Confirmed",
            },
            {
                $set: {
                    status: "Completed",
                    updatedAt: new Date(),
                },
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(409).json({
                success: false,
                message: "Booking status has already changed.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Booking completed successfully.",
        });
    } catch (error) {
        console.error("Complete booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to complete booking.",
        });
    }
});

// ==========================================
// CANCEL BOOKING (BOOKING USER ONLY)
// ==========================================

app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const result = await req.bookingsCollection.updateOne(
            {
                _id: new ObjectId(id),
                userEmail: req.user.email,
                status: "Pending",
            },
            {
                $set: {
                    status: "Cancelled",
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Pending booking not found or you are not the booking owner.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Booking cancelled successfully.",
        });
    } catch (error) {
        console.error("Cancel booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to cancel booking.",
        });
    }
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        success: false,
        message: error.message || "Internal server error.",
    });
});

// ==========================================
// SERVER START
// ==========================================

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`StudioSpace server running on port ${PORT}`);
    });
}

export default app;
