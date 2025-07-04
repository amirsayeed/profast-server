// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require('mongodb');
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


        // GET all parcels OR filter by created_by email
        app.get('/parcels', async (req, res) => {
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


        app.get('/payments', async (req, res) => {
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