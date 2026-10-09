Architecture: Why did you structure it this way?

I chose the architecture i used because i wanted to make the code easier to debug and modify, the main server app is for retrieving the request and validating its data content, then the background worker handles the bank api calls and retries, since i noticed that each bank api endpoint had a different set of required credentials i made a bank client to handle each endpoint api call instead of haveing one cumbersome function that would take in all possible credentials that could be asked, this made the code more readable.






State management: How do you track payment state? Why?
You had stated that my database should be my singular source of truth in the project description, so thats what i did, i stored all data including the auth expiry date so that i would be able to determine if the auth had expired inside of the app instead on relying on the bank that could be unreliable, i also used transitional states like CAPTURE_PENDING and VOID_PENDING to block all incoming void requests while the app was waiting for a response from the bank for a capture request and vice versa




Failure handling: What's your retry strategy? How do you handle partial failures?
when i sent a request to the bank, i used the status code of the response to determine if i retried or not, a 200 status code meant the request was succesful and therefore didnt need a retry, a 400 status code meant the request had failed in the sense that it was unsuccesful so there was no need to try again as the current circumstances in the request would only guarantee failure, but a 500 status code meant there was an internal opperations server error which is like a glitch on the server hence i needed to retry to get a definitive result, i dealt with partial failure using postgres' database atomic transactions feature which made sure that in a case of a partial failure while writing data to the database the operation was rolled back, so this guaranteed that all the data was either written or none was written at all and the process was restared on the next given opportunity.



Idempotency: How did you implement it? What edge cases did you consider?
i made two tables, one to store the idempotency keys for the incoming requests and another table to store idempootency keys for outgoing requests to the bank i.e the retry jobs, the only edge case i could think of was one where the request came in without an idempotency key in the header,and i simply refused the app to process the request and prompt the client for a key, just like the bank did to the app



What you'd do differently: With more time or in production, what would change?
i honestly dont know what id do differently, but im willing to learn, any feedback would be appreciated.