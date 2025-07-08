// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require('mongodb');
const admin = require("firebase-admin");

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const verifyFBToken = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({
            message: 'unauthorized access'
        });
    }

    const token = authHeader.split(' ')[1];

    // verify token
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
    } catch (error) {
        return res.status(401).send({
            message: 'unauthorized access'
        })
    }
}

const verifyTokenEmail = (req, res, next) => {
    if (req.query.email !== req.decoded.email) {
        return res.status(403).send({
            message: 'forbidden access'
        })
    }
    next();
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tnmpmcr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db('parcelDB');
        const parcelsCollection = db.collection('parcels');
        const paymentsCollection = db.collection('payments');
        const usersCollection = db.collection('users');
        const ridersCollection = db.collection('riders');

        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExists = await usersCollection.findOne({
                email
            });
            if (userExists) {
                return res.status(200).send({
                    message: 'user already exists',
                    inserted: false
                });
            }
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        // GET all parcels OR filter by created_by email
        app.get('/parcels', verifyFBToken, verifyTokenEmail, async (req, res) => {
            try {
                const email = req.query.email;

                let query = {};
                if (email) {
                    query = {
                        created_by: email
                    };
                }

                const parcels = await parcelsCollection
                    .find(query)
                    .sort({
                        createdAt: -1
                    }) // latest first
                    .toArray();

                res.send(parcels);
            } catch (error) {
                res.status(500).send({
                    message: error.message
                });
            }
        });

        app.get('/parcels/:id', async (req, res) => {
            const {
                id
            } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: 'Invalid parcel ID'
                });
            }

            try {
                const parcel = await parcelsCollection.findOne({
                    _id: new ObjectId(id)
                });

                if (!parcel) {
                    return res.status(404).json({
                        error: 'Parcel not found'
                    });
                }

                res.json(parcel);
            } catch (err) {
                console.error('Error fetching parcel:', err);
                res.status(500).json({
                    error: 'Server error'
                });
            }
        });

        app.post('/parcels', async (req, res) => {
            try {
                const parcelData = req.body;
                const result = await parcelsCollection.insertOne(parcelData);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({
                    message: error.message
                });
            }
        });

        app.delete('/parcels/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const result = await parcelsCollection.deleteOne({
                    _id: new ObjectId(id)
                });

                res.send(result);
            } catch (error) {
                console.error('Error deleting parcel:', error);
                res.status(500).send({
                    message: 'Failed to delete parcel'
                });
            }
        });


        app.get('/payments', verifyFBToken, verifyTokenEmail, async (req, res) => {
            try {
                const userEmail = req.query.email;

                const query = userEmail ? {
                    email: userEmail
                } : {};

                const options = {
                    sort: {
                        paid_at: -1
                    }
                };

                const payments = await paymentsCollection.find(query, options).toArray();
                res.send(payments);
            } catch (error) {
                console.error('Error fetching payment history:', error);
                res.status(500).send({
                    message: 'Failed to get payments'
                });
            }
        })

        app.post('/payments', async (req, res) => {
            const {
                parcelId,
                email,
                amount,
                paymentMethod,
                transactionId
            } = req.body;

            try {
                // Update parcel's payment_status to "paid"
                const parcelResult = await parcelsCollection.updateOne({
                    _id: new ObjectId(parcelId)
                }, {
                    $set: {
                        payment_status: "paid"
                    }
                });

                // Save payment history
                const paymentData = {
                    email,
                    parcelId,
                    amount,
                    paymentMethod,
                    transactionId,
                    paid_at_string: new Date().toISOString(),
                    paid_at: new Date()
                };

                const paymentResult = await paymentsCollection.insertOne(paymentData);

                res.status(201).json({
                    message: "Payment confirmed and recorded.",
                    insertedId: paymentResult.insertedId
                });

            } catch (err) {
                console.error(err);
                res.status(500).send({
                    message: "Failed to confirm payment."
                });
            }
        });


        app.post('/create-payment-intent', async (req, res) => {
            const amountInCents = req.body.amountInCents;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                });

                res.json({
                    clientSecret: paymentIntent.client_secret
                });
            } catch (error) {
                res.status(500).json({
                    error: error.message
                });
            }
        });

        app.post('/riders', async (req, res) => {
            const rider = req.body;
            const result = await ridersCollection.insertOne(rider);
            res.send(result);
        })

        app.get('/riders/pending', async (req, res) => {
            try {
                const pendingRiders = await ridersCollection
                    .find({
                        status: 'pending'
                    })
                    .toArray();
                res.send(pendingRiders);
            } catch (error) {
                console.error('Error fetching pending riders:', error);
                res.status(500).send({
                    message: 'Failed to load pending riders'
                });
            }
        });

        app.get('/riders/active', async (req, res) => {
            try {
                const activeRiders = await ridersCollection.find({
                    status: 'active'
                }).toArray();
                res.send(activeRiders);
            } catch (err) {
                res.status(500).send({
                    message: 'Error fetching active riders'
                });
            }
        });

        app.patch('/riders/:id', async (req, res) => {
            const {
                id
            } = req.params;
            const {
                status
            } = req.body;

            if (!['active', 'cancelled', 'pending'].includes(status)) {
                return res.status(400).send({
                    message: 'Invalid status value'
                });
            }

            try {
                const result = await ridersCollection.updateOne({
                    _id: new ObjectId(id)
                }, {
                    $set: {
                        status
                    }
                });

                if (result.modifiedCount > 0) {
                    res.send({
                        success: true,
                        modifiedCount: result.modifiedCount
                    });
                } else {
                    res.status(404).send({
                        success: false,
                        message: 'Rider not found or already updated'
                    });
                }
            } catch (error) {
                console.error('Error updating rider status:', error);
                res.status(500).send({
                    success: false,
                    message: 'Server error'
                });
            }
        });


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({
        //     ping: 1
        // });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


// Default route
app.get('/', (req, res) => {
    res.send('Parcel Server is running!');
});

// Start server
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});