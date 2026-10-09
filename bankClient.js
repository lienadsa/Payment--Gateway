import dotenv from 'dotenv';
import axios from 'axios';


dotenv.config();

async function authorizePayment(job, paymentInfo) {
  let res;
  try {
          res = await axios.post((process.env.BANK + '/authorizations'),{
        "amount": paymentInfo.amount,
        "card_number": `${paymentInfo.card_no}`,
        "cvv": `${paymentInfo.cvv}`,
        "expiry_month": paymentInfo.expiry_month,
        "expiry_year": paymentInfo.expiry_year
}, 
        {  headers: {
            'Idempotency-Key': job.idempotency_key,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        },
          
        );
      } catch (error) {
        console.error("Error authorizing payment:", error);
        return error.response;
      }
    
      return res;
}

async function capturePayment(job, paymentInfo) {
  let res;
  try {
          res = await axios.post((process.env.BANK + '/captures'),{
        "amount": paymentInfo.amount,
        "authorization_id": `${paymentInfo.auth_id}`,
}, 
        {  headers: {
            'Idempotency-Key': job.idempotency_key,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        },
          
        );
      } catch (error) {
        console.error("Error capturing payment:", error);
        return error.response;
      }
    
      return res;

}

async function voidPayment(job, paymentInfo) {
  
  let res;
  try {
          res = await axios.post((process.env.BANK + '/voids'),{
        "authorization_id": `${paymentInfo.auth_id}`
}, 
        {  headers: {
            'Idempotency-Key': job.idempotency_key,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        },
          
        );
      } catch (error) {
        console.error("Error capturing payment:", error);
        return error.response;
      }
    
      return res;



}

async function refundPayment(job, paymentInfo) {

   let res;
  try {
          res = await axios.post((process.env.BANK + '/refunds'),{
        "amount": paymentInfo.amount,    
        "capture_id": `${paymentInfo.capture_id}`
}, 
        {  headers: {
            'Idempotency-Key': job.idempotency_key,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        },
          
        );
      } catch (error) {
        console.error("Error capturing payment:", error);
        return error.response;
      }
    
      return res; 

}

export const bankClient = {
    authorizePayment,
    capturePayment,
    voidPayment,
    refundPayment
};