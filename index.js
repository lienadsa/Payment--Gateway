import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bcrypt from 'bcrypt';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { bankClient } from './bankClient.js';

dotenv.config();
const { authorizePayment, capturePayment, voidPayment, refundPayment } = bankClient;
const app = express();
const port = process.env.PORT;
const worker_id = crypto.randomUUID();


const { Pool } = pg;


const pool = new Pool({
  user: process.env.PG_USER, 
  host: process.env.PG_HOST, 
  database: process.env.PG_DATABASE, 
  password: process.env.PG_PASSWORD, 
  port: process.env.PG_PORT,
});

function generateIdempotencyKey(){
  return crypto.randomUUID();
}

function isExpired(date) {
  const now = new Date();
  if (date < now){
    return true;
  }
  return false;
}

async function retryJob(retryJobId) {
   const result = await pool.query("SELECT * FROM retry_jobs WHERE id = $1", [retryJobId]);
   const payment_result = await pool.query("SELECT * FROM payments WHERE payment_id = $1", [result.rows[0].payment_id]);

   const job = result.rows[0];
   const paymentInfo = payment_result.rows[0];

   if (!job){
    return console.error("No job found with ID:", retryJobId);
   }
   
   console.log("Retrying job with ID:", retryJobId, "and payment_id:", job.payment_id);
   if (job.status === 'PENDING') {
     await pool.query("UPDATE retry_jobs SET status = 'PROCESSING' WHERE payment_id = $1 AND path = $2", [job.payment_id, job.path]);
   }
    
   if (job.path === 'authorize'){
    var repeat = true;
    var timeout = 0;
    while (repeat) {
      const bankResponse = await authorizePayment(job, paymentInfo);
      if (bankResponse){
       if (bankResponse.status === 200 || bankResponse.status === 400 || bankResponse.status === 402 ) {
        repeat = false;
        if (bankResponse.status === 200 && bankResponse.data.status === 'approved'){
        
               try {
        await pool.query ("BEGIN");
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [job.payment_id, 'AUTHORIZED']);

        await pool.query("UPDATE retry_jobs SET status = 'COMPLETED' WHERE id = $1", [retryJobId]);
        
        await pool.query("UPDATE payments SET auth_id = $1, payment_status = $2, auth_exp = $3 WHERE payment_id = $4", [bankResponse.data.authorization_id, 'AUTHORIZED', bankResponse.data.expires_at, job.payment_id]);
        
       await pool.query("COMMIT");
       return { message: "Payment authorized successfully", payment_id: job.payment_id, };
      
       } catch (err) {
        await pool.query("ROLLBACK");
       return { error: "Internal Server Error", message: err.message };
       }
        } else if (bankResponse.status === 402 || bankResponse.status === 400) {

          try {
            await pool.query("BEGIN");
            await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE id = $1", [retryJobId]);
            await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['FAILED', job.payment_id]);
            await pool.query("COMMIT");

          } catch (err) {
          await pool.query("ROLLBACK");
          return { error: "Internal Server Error", message: err.message };
          }

          if (bankResponse.status === 400) {
          return { error: bankResponse , message: 'Invalid card details' };
          } else if (bankResponse.status === 402) {
          return { error: bankResponse.error, message: bankResponse.message };
          }
          
        }
        }
      } else {
        setTimeout(() => {
          const serverHealth = axios.get(`${process.env.BANK_URL}/health` ,{ timeout: 5000 });
          if (serverHealth.status === 200){
            timeout = 150000;
          } else {
            timeout = 300000;
          }
        }, timeout);
      }
       
      }
    
    }  else if (job.path === 'capture'){
      var repeat = true;
      var timeout = 0;
    while (repeat) {
      const bankResponse = await capturePayment(job, paymentInfo);
      if (bankResponse){
       if (bankResponse.status === 200 || bankResponse.status === 400) {
        repeat = false;
        if (bankResponse.status === 200 && bankResponse.data.status === 'captured'){
        
               try {
        await pool.query ("BEGIN");
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [job.payment_id, 'CAPTURED']);

        await pool.query("UPDATE retry_jobs SET status = 'COMPLETED' WHERE id = $1 AND path = $2", [retryJobId, 'capture']);
        
        await pool.query("UPDATE payments SET capture_id = $1, payment_status = $2 WHERE payment_id = $3", [bankResponse.data.capture_id, 'CAPTURED', job.payment_id]);
        
       await pool.query("COMMIT");
       return { message: "Payment captured successfully", payment_id: job.payment_id, };
      
       } catch (err) {
        await pool.query("ROLLBACK");
       return { error: "Internal Server Error", message: err.message };
       }
        } else if (bankResponse.status === 400) {

          try {
            await pool.query("BEGIN");
            await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE id = $1 AND path = $2", [retryJobId, 'capture']);
            await pool.query("COMMIT");
            return { error: bankResponse , message: 'Invalid details' };

          } catch (err) {
          await pool.query("ROLLBACK");
          return { error: "Internal Server Error", message: err.message };
          } 
        }
        }
      } else {
        setTimeout(() => {
          const serverHealth = axios.get(`${process.env.BANK_URL}/health` ,{ timeout: 5000 });
          if (serverHealth.status === 200){
            timeout = 150000;
          } else {
            timeout = 300000;
          }
        }, timeout);
      }
       
      }

   
    } else if (job.path === 'void'){

      var repeat = true;
      var timeout = 0;
    while (repeat) {
      const bankResponse = await voidPayment(job, paymentInfo);
      if (bankResponse){
       if (bankResponse.status === 200 || bankResponse.status === 400) {
        repeat = false;
        if (bankResponse.status === 200 && bankResponse.data.status === 'voided'){
        
               try {
        await pool.query ("BEGIN");
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [job.payment_id, 'VOIDED']);

        await pool.query("UPDATE retry_jobs SET status = 'COMPLETED' WHERE id = $1 AND path = $2", [retryJobId, 'void']);
        
        await pool.query("UPDATE payments SET void_id = $1, payment_status = $2 WHERE payment_id = $3", [bankResponse.data.void_id, 'VOIDED', job.payment_id]);
        
       await pool.query("COMMIT");
       return { message: "Payment captured voided", payment_id: job.payment_id, };
      
       } catch (err) {
        await pool.query("ROLLBACK");
       return { error: "Internal Server Error", message: err.message };
       }
        } else if (bankResponse.status === 400) {

          try {
            await pool.query("BEGIN");
            await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE id = $1 AND path = $2", [retryJobId, 'void']);
            await pool.query("COMMIT");
            return { error: bankResponse , message: 'Invalid details' };

          } catch (err) {
          await pool.query("ROLLBACK");
          return { error: "Internal Server Error", message: err.message };
          } 
        }
        }
      } else {
        setTimeout(() => {
          const serverHealth = axios.get(`${process.env.BANK_URL}/health` ,{ timeout: 5000 });
          if (serverHealth.status === 200){
            timeout = 150000;
          } else {
            timeout = 300000;
          }
        }, timeout);
      }
       
      }

   
    

   } else if (job.path === 'refund'){

      var repeat = true;
      var timeout = 0;
    while (repeat) {
      const bankResponse = await refundPayment(job, paymentInfo);
      if (bankResponse){
       if (bankResponse.status === 200 || bankResponse.status === 400) {
        repeat = false;
        if (bankResponse.status === 200 && bankResponse.data.status === 'refunded'){
        
               try {
        await pool.query ("BEGIN");
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [job.payment_id, 'REFUNDED']);

        await pool.query("UPDATE retry_jobs SET status = 'COMPLETED' WHERE id = $1 AND path = $2", [retryJobId, 'refund']);
        
        await pool.query("UPDATE payments SET refund_id = $1, payment_status = $2 WHERE payment_id = $3", [bankResponse.data.refund_id, 'REFUNDED', job.payment_id]);
        
       await pool.query("COMMIT");
       return { message: "Payment refunded", payment_id: job.payment_id, };
      
       } catch (err) {
        await pool.query("ROLLBACK");
       return { error: "Internal Server Error", message: err.message };
       }
        } else if (bankResponse.status === 400) {

          try {
            await pool.query("BEGIN");
            await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE id = $1 AND path = $2", [retryJobId, 'refund']);
            await pool.query("COMMIT");
            return { error: bankResponse , message: 'Invalid details' };

          } catch (err) {
          await pool.query("ROLLBACK");
          return { error: "Internal Server Error", message: err.message };
          } 
        }
        }
      } else {
        setTimeout(() => {
          const serverHealth = axios.get(`${process.env.BANK_URL}/health` ,{ timeout: 5000 });
          if (serverHealth.status === 200){
            timeout = 150000;
          } else {
            timeout = 300000;
          }
        }, timeout);
      }
       
      }

   
    

   }
   


}

async function recoverCrashedRetryJobs() {

  const jobs = await pool.query("SELECT * FROM retry_jobs WHERE status = 'PROCESSING' OR status = 'PENDING'");
  if (jobs.rows.length > 0) {
    console.log("Recovering crashed retry jobs...");
    for (const job of jobs.rows) {
      if (worker_id !== job.worker_id){
        console.log("Recovering job with ID:", job.id, "and payment_id:", job.payment_id);
       const result = await retryJob(job.id);
       console.log("Recovery result for job ID:", job.id, "message:", result);
      } else {
        console.log("Job with ID:", job.id, "and payment_id:", job.payment_id, "is already being processed.");
      }
    }
  } else {
    console.log("No crashed retry jobs found.");
  }

}

async function startRetryWorker() {
  const client = await pool.connect();

  await client.query("LISTEN payment_retry");

  console.log("Retry worker is listening for retry job notifications...");

  client.on("notification", async (msg) => {
    const retryJobId = msg.payload;
    console.log("New retry job received with ID:", retryJobId);
    await retryJob(retryJobId);
  });
}


app.use(cors({
  origin: process.env.FICMART_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));





app.use(express.json());
app.use(express.urlencoded({ extended: true }));



pool.connect()
  .then(() => console.log('Connected to Database'))
  .catch(err => console.error('Connection error:', err.message)); 


app.post('/authorize' , async (req,res) => {
  try {
    const { idempotencykey } = req.headers;
    const { order_id, customer_id, card_no, amount, cvv, expiry_month, expiry_year } = req.body;
    
     if (!idempotencykey || !order_id || !customer_id || !card_no || !amount || !cvv || !expiry_month || !expiry_year) {
    return res.status(400).json({
      error: "Bad Request",
      message: "incomplete order credentials, please provide all the required fields: order_id, customer_id, card_no, amount, cvv, expiry_month, expiry_year and an idempotency key in the headers"
    });
  }
  } catch (error) {
    return res.status(500).json({
        error: "Internal Server Error" ,
        message: error.message
      })
  }
    const { idempotencykey } = req.headers;
    const { order_id, customer_id, card_no, amount, cvv, expiry_month, expiry_year } = req.body;
    let payment_id; 
    let paymentInfo;

      try {
       
        paymentInfo = await pool.query(
        'SELECT payment_id FROM idempotency WHERE idempotency_key = $1 AND path = $2',
        [idempotencykey, 'authorize']
       )

      } catch (error) {
       return res.status(500).json({ error: "aInternal Server Error" , message: error.message });
      }

      if (paymentInfo.rows.length === 0) {

        const bankIdempotencyKey = generateIdempotencyKey();

       try {
        await pool.query ("BEGIN");
       
      const res = await pool.query(
       'INSERT INTO payments (order_id, customer_id, card_no, amount , cvv, expiry_month, expiry_year) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING payment_id',
       [order_id, customer_id, card_no, amount , cvv, expiry_month, expiry_year]
      );
       payment_id = res.rows[0].payment_id;

      await pool.query(
        'INSERT INTO idempotency (idempotency_key, payment_id, path) VALUES ($1, $2, $3)',
        [idempotencykey, payment_id, 'authorize']
      );

      await pool.query(
        'INSERT INTO status (status, payment_id) VALUES ($1, $2)',
        ['PENDING', payment_id]
      );

      await pool.query(
        'INSERT INTO retry_jobs (payment_id, idempotency_key, attempt_count, status, worker_id, path) VALUES ($1, $2, $3, $4, $5, $6)',
        [payment_id, bankIdempotencyKey, 0, 'PENDING', worker_id, 'authorize']
      );
 
       await pool.query("COMMIT");
      return res.status(201).json({ message: "Payment authorization request received", payment_id: payment_id });
      
       } catch (err) {
        await pool.query("ROLLBACK");
        return res.status(500).json({ error: "dInternal Server Error" , message: err.message });
       }
          
       } else {
        return res.status(201).json({ message: "Payment authorization request received", payment_id: paymentInfo.rows[0].payment_id });
       }
      
      
  

})

app.post('/capture' , async (req,res) => {
  const idempotencykey = req.headers.idempotencykey;
  const { payment_id } = req.body;
  if (!idempotencykey || !payment_id) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide idempotency key and payment ID" });
    return;
  } else {
    try {
       const paymentInfo = await pool.query(
        'SELECT payment_id FROM idempotency WHERE idempotency_key = $1 AND path = $2',
        [idempotencykey, 'capture']
       )
       if (paymentInfo.rows.length > 0) {
         return res.status(201).json({ message: "Payment capture request received", payment_id: paymentInfo.rows[0].payment_id });  

       }
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" , message: error.message });
  }
   
  try {
    const status = await pool.query(
      'SELECT payment_status FROM payments WHERE payment_id = $1',
      [payment_id]
    );
    const validStatus = await pool.query(
      'SELECT auth_exp FROM payments WHERE payment_id = $1',
      [payment_id]
    );

    if (status.rows.length > 0) {
      if (status.rows[0].payment_status === 'AUTHORIZED'){
        if (!isExpired(validStatus.rows[0].auth_exp)){
          const bankIdempotencyKey = generateIdempotencyKey();
          try {
        await pool.query ("BEGIN");
        await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['CAPTURE_PENDING', payment_id]);
        await pool.query("INSERT INTO idempotency (idempotency_key, payment_id, path) VALUES ($1, $2, $3)", [idempotencykey, payment_id, 'capture']);
        await pool.query("INSERT INTO retry_jobs (payment_id, idempotency_key, attempt_count, status, worker_id, path) VALUES ($1, $2, $3, $4, $5, $6)", [payment_id, bankIdempotencyKey, 0, 'PENDING', worker_id, 'capture']);
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [payment_id, 'PENDING']);
        await pool.query("COMMIT");
        return res.status(201).json({ message: "Payment capture request received", payment_id: payment_id });

      
       } catch (err) {
        await pool.query("ROLLBACK");
        res.status(500).json({ error: "qInternal Server Error" , message: err.message });
       }
        
        } else {
          try {
        await pool.query ("BEGIN");
        await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['EXPIRED', payment_id]);
        await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE payment_id = $1 AND path = $2", [payment_id, 'capture']);
       await pool.query("COMMIT");
      
       } catch (err) {
        await pool.query("ROLLBACK");
        res.status(500).json({ error: "rInternal Server Error" });
       }

          res.status(400).json({ error: "Bad Request", message: "Authorization has expired, cannot capture" });
        }
      } else {
       res.status(400).json({ error: "Bad Request", message: "Payment has not been authorized or payment has been voided, cannot capture" });
      }  
    } else {
      return res.status(404).json({ error: "Not Found", message: "Payment ID not found" });
    }

  } catch (error) {
    return res.status(500).json({ error: "sInternal Server Error" , message: error.message });
  }
   

}
})

app.post('/void' , async (req,res) => {
  
  const idempotencykey = req.headers.idempotencykey;
  const { payment_id } = req.body;
  if (!idempotencykey || !payment_id) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide idempotency key and payment ID" });
    return;
  } else {
    try {
       const paymentInfo = await pool.query(
        'SELECT payment_id FROM idempotency WHERE idempotency_key = $1 AND path = $2',
        [idempotencykey, 'capture']
       )
       if (paymentInfo.rows.length > 0) {
         return res.status(201).json({ message: "Payment void request received", payment_id: paymentInfo.rows[0].payment_id });  

       }
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" , message: error.message });
  }
   
  try {
    const status = await pool.query(
      'SELECT payment_status FROM payments WHERE payment_id = $1',
      [payment_id]
    );
    const validStatus = await pool.query(
      'SELECT auth_exp FROM payments WHERE payment_id = $1',
      [payment_id]
    );

    if (status.rows.length > 0) {
      if (status.rows[0].payment_status === 'AUTHORIZED'){
        if (!isExpired(validStatus.rows[0].auth_exp)){
          const bankIdempotencyKey = generateIdempotencyKey();
          try {
        await pool.query ("BEGIN");
        await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['VOID_PENDING', payment_id]);
        await pool.query("INSERT INTO idempotency (idempotency_key, payment_id, path) VALUES ($1, $2, $3)", [idempotencykey, payment_id, 'void']);
        await pool.query("INSERT INTO retry_jobs (payment_id, idempotency_key, attempt_count, status, worker_id, path) VALUES ($1, $2, $3, $4, $5, $6)", [payment_id, bankIdempotencyKey, 0, 'PENDING', worker_id, 'void']);
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [payment_id, 'PENDING']);
        await pool.query("COMMIT");
        return res.status(201).json({ message: "Payment void request received", payment_id: payment_id });

      
       } catch (err) {
        await pool.query("ROLLBACK");
        res.status(500).json({ error: "qInternal Server Error" , message: err.message });
       }
        
        } else {
          try {
        await pool.query ("BEGIN");
        await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['EXPIRED', payment_id]);
        await pool.query("UPDATE retry_jobs SET status = 'FAILED' WHERE payment_id = $1 AND path = $2", [payment_id, 'capture']);
       await pool.query("COMMIT");
      
       } catch (err) {
        await pool.query("ROLLBACK");
        res.status(500).json({ error: "rInternal Server Error" });
       }

          res.status(400).json({ error: "Bad Request", message: "Authorization has expired, cannot capture" });
        }
      } else {
       res.status(400).json({ error: "Bad Request", message: "Payment has not been authorized or payment has been captured, cannot void" });
      }  
    } else {
      return res.status(404).json({ error: "Not Found", message: "Payment ID not found" });
    }

  } catch (error) {
    return res.status(500).json({ error: "sInternal Server Error" , message: error.message });
  }
   

}
})

app.post('/refund' , async (req,res) => {
  
  const idempotencykey = req.headers.idempotencykey;
  const { payment_id } = req.body;
  if (!idempotencykey || !payment_id) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide idempotency key and payment ID" });
    return;
  } else {
    try {
       const paymentInfo = await pool.query(
        'SELECT payment_id FROM idempotency WHERE idempotency_key = $1 AND path = $2',
        [idempotencykey, 'refund']
       )
       if (paymentInfo.rows.length > 0) {
         return res.status(201).json({ message: "Payment refund request received", payment_id: paymentInfo.rows[0].payment_id });  

       }
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" , message: error.message });
  }
   
  try {
    const status = await pool.query(
      'SELECT payment_status FROM payments WHERE payment_id = $1',
      [payment_id]
    );

    if (status.rows.length > 0) {
      if (status.rows[0].payment_status === 'CAPTURED'){
      
          const bankIdempotencyKey = generateIdempotencyKey();
          try {
        await pool.query ("BEGIN");
        await pool.query("UPDATE payments SET payment_status = $1 WHERE payment_id = $2", ['REFUND_PENDING', payment_id]);
        await pool.query("INSERT INTO idempotency (idempotency_key, payment_id, path) VALUES ($1, $2, $3)", [idempotencykey, payment_id, 'refund']);
        await pool.query("INSERT INTO retry_jobs (payment_id, idempotency_key, attempt_count, status, worker_id, path) VALUES ($1, $2, $3, $4, $5, $6)", [payment_id, bankIdempotencyKey, 0, 'PENDING', worker_id, 'refund']);
        await pool.query("INSERT INTO status (payment_id, status) VALUES ($1, $2)", [payment_id, 'PENDING']);
        await pool.query("COMMIT");
        return res.status(201).json({ message: "Payment refund request received", payment_id: payment_id });


       } catch (err) {
        await pool.query("ROLLBACK");
        res.status(500).json({ error: "qInternal Server Error" , message: err.message });
       }
        
        

      } else {
       res.status(400).json({ error: "Bad Request", message: "Payment has either been voided or is yet to be captured, and therefore a refund request cant be processed at this time" });
      }  
    } else {
      return res.status(404).json({ error: "Not Found", message: "Payment ID not found" });
    }

  } catch (error) {
    return res.status(500).json({ error: "sInternal Server Error" , message: error.message });
  }
  
}
})

app.get( '/status/:order_id' , async (req,res) => {
   const {order_id} = req.params;
  if (!order_id){
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide order ID" });
    } else {
      const OrderStatus = await pool.query("SELECT payment_status FROM payments WHERE order_id = $1", [order_id]);
      if (OrderStatus.rows.length > 0){
         
       res.status(200).json({
        "Payment Status" : `${OrderStatus.rows[0].payment_status}` 
       })

      } else {
       res.status(400).json({ error: "Bad Request", message: "order information could not be found" });
      }
    }
})

app.get( '/history/:customer_id' , async (req,res) => {
   const {customer_id} = req.params;
  if (!customer_id){
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide customer ID" });
    } else {
      const customerInfo = await pool.query("SELECT * FROM payments WHERE customer_id = $1", [customer_id]);
      if (customerInfo.rows.length > 0){
         
       res.status(200).json({
        "Customer Order history" : customerInfo.rows 
       })

      } else {
       res.status(400).json({ error: "Bad Request", message: "customer information could not be found" });
      }
    }
})

app.get( '/receipt/:payment_id' , async (req,res) => {
  const {payment_id} = req.params;
  if (!payment_id){
    res.status(400).json({ error: "Bad Request", message: "Missing required fields, please provide payment ID" });
    } else {
      const paymentReceipt = await pool.query("SELECT * FROM payments WHERE payment_id = $1", [payment_id]);
      const states = await pool.query("SELECT * FROM status WHERE payment_id = $1", [payment_id]);

      if (paymentReceipt.rows.length > 0){
        res.status(200).json({
        "Payment Reference": `${paymentReceipt.rows[0].payment_id}`,
        "Order ID":  `${paymentReceipt.rows[0].order_id}`,
        "Customer ID": `${paymentReceipt.rows[0].customer_id}`,
        "Amount": `${paymentReceipt.rows[0].amount}`/100,
        "Currency": "USD",
        "Status": `${paymentReceipt.rows[0].payment_status}`,
        "Authorization_id": `${paymentReceipt.rows[0].auth_id}`,
        "Capture_id": `${paymentReceipt.rows[0].capture_id}` ,
        "Void_id": `${paymentReceipt.rows[0].void_id}` ,
        "Refund_id": `${paymentReceipt.rows[0].refund_id}`,
        "State transition history": states.rows

      })
      } else {
        res.status(400).json({ error: "Bad Request", message: "payment ID could not be found" });
      }
    }
})

app.listen(port, async () => {

  await startRetryWorker();
  await recoverCrashedRetryJobs();
  console.log(`Server is running on port ${port}`);
});
