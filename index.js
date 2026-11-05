
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";

const app = express();

const PORT = process.env.PORT || 5000;

// ==========================================
// CORS CONFIGURATION
// ==========================================

const allowedOrigins = (
    process.env.CLIENT_URL || "http://localhost:3000"
)
    .split(",")
    .map((url) => url.trim());

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);

// ==========================================
// BETTER AUTH HANDLER
// IMPORTANT: Must be before express.json()
// ==========================================

app.all("/api/auth/*", toNodeHandler(auth));

// ==========================================
// EXPRESS JSON MIDDLEWARE
// ==========================================

app.use(express.json());

// ==========================================
// MONGODB CONNECTION
// ==========================================

if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is missing from environment variables.");
}

const client = new MongoClient(process.env.MONGODB_URL);

let database;
let studiosCollection;
let bookingsCollection;
let connectionPromise;

async function connectToMongoDB() {
    if (database) return database;

    if (!connectionPromise) {
        connectionPromise = client
            .connect()
            .then(() => {
                console.log("Connected to MongoDB successfully!");

                database = client.db("studioSpace");

                studiosCollection = database.collection("studios");
                bookingsCollection = database.collection("bookings");

                return database;
            })
            .catch((error) => {
                connectionPromise = null;
                console.error("MongoDB connection failed:", error);
                throw error;
            });
    }

    return connectionPromise;
}

// ==========================================
// CONNECT TO DATABASE BEFORE API REQUESTS
// ==========================================

app.use(async (req, res, next) => {
    try {
        await connectToMongoDB();
        next();
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed.",
        });
    }
});

// ==========================================
// HOME ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.status(200).send("Welcome to StudioSpace API");
});

// ==========================================
// ADD NEW STUDIO
// ==========================================

app.post("/add-newstudio", async (req, res) => {
    try {
        const data = req.body;

        const ownerEmail = (
            data.ownerEmail ||
            data.userEmail ||
            ""
        ).trim().toLowerCase();

        if (!ownerEmail) {
            return res.status(400).json({
                success: false,
                message: "Owner email is required.",
            });
        }

        const studioData = {
            title: data.title?.trim(),
            image: data.image || data.imageUrl || "",
            imageUrl: data.imageUrl || data.image || "",
            category: data.category,
            pricePerHour: Number(data.pricePerHour),
            rating: Number(data.rating) || 0,
            location: data.location?.trim(),
            ownerEmail,
            userEmail: ownerEmail,
            createdAt: new Date(),
        };

        if (
            !studioData.title ||
            !studioData.category ||
            !studioData.location ||
            !Number.isFinite(studioData.pricePerHour) ||
            studioData.pricePerHour <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid studio details.",
            });
        }

        if (studioData.rating < 0 || studioData.rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 0 and 5.",
            });
        }

        const result = await studiosCollection.insertOne(studioData);

        console.log("New studio added:", result.insertedId);

        res.status(201).json({
            success: true,
            message: "Studio added successfully!",
            insertedId: result.insertedId,
        });
    } catch (error) {
        console.error("Add studio error:", error);

        res.status(500).json({
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
        const result = await studiosCollection
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json(result);
    } catch (error) {
        console.error("Get studios error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch studios.",
        });
    }
});

// ==========================================
// GET STUDIOS BY OWNER EMAIL
// ==========================================

app.get("/my-studios", async (req, res) => {
    try {
        const email = req.query.email;

        if (!email || typeof email !== "string") {
            return res.status(400).json({
                success: false,
                message: "Owner email is required.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const result = await studiosCollection
            .find({
                $or: [
                    { ownerEmail: normalizedEmail },
                    { userEmail: normalizedEmail },
                ],
            })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            studios: result,
        });
    } catch (error) {
        console.error("Get my studios error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch your studios.",
        });
    }
});

// ==========================================
// GET FEATURED STUDIOS
// ==========================================

app.get("/featured-studios", async (req, res) => {
    try {
        const result = await studiosCollection
            .find()
            .sort({ rating: -1, createdAt: -1 })
            .limit(6)
            .toArray();

        res.status(200).json(result);
    } catch (error) {
        console.error("Featured studios error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch featured studios.",
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

        const result = await studiosCollection.findOne({
            _id: new ObjectId(id),
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Studio not found.",
            });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error("Get single studio error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch studio.",
        });
    }
});

// ==========================================
// UPDATE STUDIO
// ==========================================

app.patch("/studios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { userEmail, ownerEmail, ...updates } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const email = (userEmail || ownerEmail || "")
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Owner email is required.",
            });
        }

        delete updates._id;
        delete updates.createdAt;

        const result = await studiosCollection.updateOne(
            {
                _id: new ObjectId(id),
                $or: [
                    { ownerEmail: email },
                    { userEmail: email },
                ],
            },
            {
                $set: {
                    ...updates,
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Studio not found or you are not the owner.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Studio updated successfully!",
        });
    } catch (error) {
        console.error("Update studio error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update studio.",
        });
    }
});

// ==========================================
// DELETE STUDIO
// ==========================================

app.delete("/studios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!ObjectId.isValid(id) || !userEmail) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio information.",
            });
        }

        const email = userEmail.trim().toLowerCase();

        const result = await studiosCollection.deleteOne({
            _id: new ObjectId(id),
            $or: [
                { ownerEmail: email },
                { userEmail: email },
            ],
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Studio not found or you are not the owner.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Studio deleted successfully!",
        });
    } catch (error) {
        console.error("Delete studio error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete studio.",
        });
    }
});

// ==========================================
// CREATE BOOKING
// ==========================================

app.post("/bookings", async (req, res) => {
    try {
        const {
            studioId,
            studioTitle,
            studioImage,
            category,
            location,
            userEmail,
            userName,
            date,
            time,
            duration,
            pricePerHour,
        } = req.body;

        if (
            !studioId ||
            !userEmail ||
            !date ||
            !time ||
            !duration ||
            pricePerHour === undefined ||
            pricePerHour === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required booking details.",
            });
        }

        if (!ObjectId.isValid(studioId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID.",
            });
        }

        const numericDuration = Number(duration);
        const numericPrice = Number(pricePerHour);

        if (
            !Number.isFinite(numericDuration) ||
            numericDuration <= 0 ||
            !Number.isFinite(numericPrice) ||
            numericPrice <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid duration or studio price.",
            });
        }

        const studio = await studiosCollection.findOne({
            _id: new ObjectId(studioId),
        });

        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found.",
            });
        }

        const booking = {
            studioId: String(studio._id),
            studioTitle: studio.title || studioTitle || "Studio",
            studioImage:
                studio.image ||
                studio.imageUrl ||
                studioImage ||
                "",
            category: studio.category || category || "",
            location: studio.location || location || "",
            userEmail: userEmail.trim().toLowerCase(),
            userName: userName || "",
            date,
            time,
            duration: numericDuration,
            pricePerHour: numericPrice,
            totalPrice: numericDuration * numericPrice,
            status: "Pending",
            createdAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(booking);

        console.log("New booking created:", result.insertedId);

        res.status(201).json({
            success: true,
            message: "Booking created successfully!",
            bookingId: result.insertedId,
            booking,
        });
    } catch (error) {
        console.error("Create booking error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create booking.",
        });
    }
});

// ==========================================
// GET BOOKINGS BY USER EMAIL
// ==========================================

app.get("/bookings", async (req, res) => {
    try {
        const email = req.query.email;

        if (!email || typeof email !== "string") {
            return res.status(400).json({
                success: false,
                message: "User email is required.",
            });
        }

        const result = await bookingsCollection
            .find({
                userEmail: email.trim().toLowerCase(),
            })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            bookings: result,
        });
    } catch (error) {
        console.error("Get bookings error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch bookings.",
        });
    }
});

// ==========================================
// CONFIRM PENDING BOOKING
// ==========================================

app.patch("/bookings/:id/confirm", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const result = await bookingsCollection.updateOne(
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

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Pending booking not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Booking confirmed successfully!",
        });
    } catch (error) {
        console.error("Confirm booking error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to confirm booking.",
        });
    }
});

// ==========================================
// COMPLETE CONFIRMED BOOKING
// ==========================================

app.patch("/bookings/:id/complete", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const result = await bookingsCollection.updateOne(
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

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Confirmed booking not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Booking completed successfully!",
        });
    } catch (error) {
        console.error("Complete booking error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to complete booking.",
        });
    }
});

// ==========================================
// CANCEL PENDING BOOKING
// ==========================================

app.patch("/bookings/:id/cancel", async (req, res) => {
    try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (
            !ObjectId.isValid(id) ||
            !userEmail ||
            typeof userEmail !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking information.",
            });
        }

        const result = await bookingsCollection.updateOne(
            {
                _id: new ObjectId(id),
                userEmail: userEmail.trim().toLowerCase(),
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
                message: "Pending booking not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Booking cancelled successfully!",
        });
    } catch (error) {
        console.error("Cancel booking error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to cancel booking.",
        });
    }
});

// ==========================================
// START LOCAL SERVER
// ==========================================

if (process.env.NODE_ENV !== "production") {
    connectToMongoDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(
                    `StudioSpace API running at http://localhost:${PORT}`
                );
            });
        })
        .catch((error) => {
            console.error("Server startup failed:", error);
            process.exit(1);
        });
}

export default app;
