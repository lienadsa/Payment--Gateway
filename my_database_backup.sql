--
-- PostgreSQL database dump
--

-- Dumped from database version 15.4
-- Dumped by pg_dump version 15.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: notify_retry_job(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_retry_job() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM pg_notify(
        'payment_retry',
        NEW.id::TEXT
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_retry_job() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: idempotency; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.idempotency (
    id integer NOT NULL,
    payment_id integer,
    idempotency_key character varying(255) NOT NULL,
    path character varying(55)
);


ALTER TABLE public.idempotency OWNER TO postgres;

--
-- Name: idempotency_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.idempotency ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.idempotency_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    payment_id integer NOT NULL,
    order_id character varying(55) NOT NULL,
    customer_id character varying(55) NOT NULL,
    amount integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    auth_id character varying(55),
    capture_id character varying(55),
    card_no character varying(20),
    cvv integer,
    expiry_month integer,
    expiry_year integer,
    auth_exp timestamp with time zone,
    void_id character varying(255),
    refund_id character varying(255),
    CONSTRAINT payments_amount_check CHECK ((amount >= 0))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ALTER COLUMN payment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: retry_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.retry_jobs (
    id integer NOT NULL,
    payment_id integer NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    attempt_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    worker_id character varying(55),
    path character varying(55)
);


ALTER TABLE public.retry_jobs OWNER TO postgres;

--
-- Name: retry_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.retry_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retry_jobs_id_seq OWNER TO postgres;

--
-- Name: retry_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.retry_jobs_id_seq OWNED BY public.retry_jobs.id;


--
-- Name: status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.status (
    id integer NOT NULL,
    payment_id integer,
    status text NOT NULL,
    occurred_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.status OWNER TO postgres;

--
-- Name: status_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.status ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: retry_jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.retry_jobs ALTER COLUMN id SET DEFAULT nextval('public.retry_jobs_id_seq'::regclass);


--
-- Data for Name: idempotency; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.idempotency (id, payment_id, idempotency_key, path) FROM stdin;
16	24	b54f5c98	authorize
17	25	b54f5c98ooi9	authorize
18	26	b54f5c98ooi9KJ	authorize
19	27	b54f5c98ooi9KJmnj	authorize
20	30	b54f5c9hhgfddt	authorize
21	31	b54f5c9hhgfddtbvcc	authorize
22	32	b54f5c9xxdse	authorize
28	32	b54f5c9xxdsebbnjjkki	capture
29	26	iiunhgftkjhb	capture
30	31	iiunhgftkjhbbvg	void
31	30	iiunhgmndjdi	void
32	33	ibvn	authorize
33	33	ibvnbv	capture
34	33	ibvnbvbvnbhyuu	refund
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (payment_id, order_id, customer_id, amount, currency, payment_status, auth_id, capture_id, card_no, cvv, expiry_month, expiry_year, auth_exp, void_id, refund_id) FROM stdin;
32	8876088543	998087	1000	USD	CAPTURED	auth_3a9a8d82-a9e8-4599-a875-ed5f80a694f4	cap_67b34d6e-0e1e-43b2-8124-0be4226fd1c0	4111111111111111	123	12	2030	2026-10-15 13:22:39.355202+01	\N	\N
24	98989060	88904	10000	USD	EXPIRED	auth_6f3b8811-92de-47bb-bcb0-52e7fec9b0b1	\N	4242424242424242	456	6	2030	\N	\N	\N
26	88766797	998087	5000	USD	CAPTURED	auth_5eed09ea-d03d-4ce4-b344-6c65e3b4f997	cap_5cbfffde-52ad-4004-aee8-1204f0e2c7a4	4111111111111111	123	12	2030	2026-10-14 19:27:48.700513+01	\N	\N
31	8876000876	998087	1000	USD	VOIDED	auth_e65a4f4b-0a27-42df-94a6-5ffeb7997380	\N	4111111111111111	123	12	2030	2026-10-15 13:21:43.477174+01	void_83a2fa58-b31a-471a-8400-d59c4474d356	\N
30	88760008	998087	5000	USD	VOIDED	auth_382f5a11-f371-47e2-8a7c-251ca7997d07	\N	4111111111111111	123	12	2030	2026-10-15 13:20:17.062279+01	void_1f5ca9ef-da40-46e3-9ccf-ee150abf3ee6	\N
33	55647373	995857	2500	USD	REFUNDED	auth_52063e59-2416-4654-ae6f-4ded4d8da1a5	cap_a256eebf-9eca-4b65-b7c5-9f7b66cbca5a	4111111111111111	123	12	2030	2026-10-16 15:28:19.591501+01	\N	ref_c32ed5e2-1bd4-48ff-ae57-9f4538374a3f
25	887667	998087	5000	USD	AUTHORIZED	auth_26d20a3a-14ac-4a00-8554-a9ec3c169332	\N	4111111111111111	123	12	2030	\N	\N	\N
27	8876679786	998087	5000	USD	AUTHORIZED	auth_29a0ad42-c811-4700-9316-5e44154c9444	\N	4111111111111111	123	12	2030	2026-10-15 13:11:20.939905+01	\N	\N
\.


--
-- Data for Name: retry_jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.retry_jobs (id, payment_id, idempotency_key, attempt_count, status, worker_id, path) FROM stdin;
17	26	50525ccf-b2e0-44f9-9ff5-a866143eb3b5	0	COMPLETED	bb5603ac-5ec6-48ba-a837-ecb3b6642d9e	authorize
18	27	eb82a48c-ea05-4d1f-9f34-035f16ad2cd5	0	COMPLETED	0c450332-ca74-4cbb-9ec7-a9399aa912a0	authorize
19	30	53cfc794-b5ea-481e-9ada-4ce92f8c8ec7	0	COMPLETED	f1ecabad-d1b5-4243-b639-d5295e628c11	authorize
20	31	897958ce-8147-4469-86c3-287c40267a17	0	COMPLETED	3be42502-91af-452f-b939-a785135624aa	authorize
21	32	882a81b1-d857-4545-8f0a-ff7b6bc4a976	0	COMPLETED	3be42502-91af-452f-b939-a785135624aa	authorize
22	32	0ee6623b-f0fd-4406-829b-16538b287cbe	0	COMPLETED	f1e0ba39-366e-47b0-8a21-e61275be35c7	capture
23	26	903d1b58-03f3-4bf2-905d-ee4880ccbef9	0	COMPLETED	5490bde7-fccf-4a5f-b641-91af7443d5ff	capture
24	31	d9bead56-79d5-408a-b09a-759d4431db01	0	COMPLETED	f8c9b32a-63f2-40fe-a1b3-54a279c0d948	void
25	30	9bdd35f6-4abe-448e-ac6c-c12c209c26a3	0	COMPLETED	5021b0db-a4a6-4797-adc2-df23f57996df	void
26	33	897929f2-8c04-4996-9d7f-055d22197afe	0	COMPLETED	ba7a6096-ca4a-4455-8c16-cd64834828cf	authorize
27	33	a3d71c47-ed96-4ae8-b1f5-2056eb55e90e	0	COMPLETED	ba7a6096-ca4a-4455-8c16-cd64834828cf	capture
28	33	41da33d3-7997-4f37-b118-72b6092d582d	0	COMPLETED	ba7a6096-ca4a-4455-8c16-cd64834828cf	refund
15	24	f38f736a-c4b0-4be4-9d1e-487a71a4182e	0	COMPLETED	5a869879-9a7c-4c82-ae7a-47c90385ab05	authorize
16	25	991ec016-52c8-41e1-9e44-31537145670a	0	COMPLETED	354a28f6-8930-48d4-b3ab-81c4ba596bca	authorize
\.


--
-- Data for Name: status; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.status (id, payment_id, status, occurred_at) FROM stdin;
116	32	PROCESSING	2026-10-08 23:57:29.036464
114	32	PROCESSING	2026-10-08 13:22:38.16534
115	32	PROCESSING	2026-10-08 13:22:39.361119
119	32	CAPTURED	2026-10-09 00:14:29.405587
120	26	PROCESSING	2026-10-09 00:17:29.55075
105	26	PROCESSING	2026-10-07 19:27:47.075685
107	26	PROCESSING	2026-10-07 19:28:43.83675
121	26	CAPTURED	2026-10-09 00:17:30.089259
122	31	PROCESSING	2026-10-09 11:45:34.686216
112	31	PROCESSING	2026-10-08 13:21:42.378201
113	31	PROCESSING	2026-10-08 13:21:43.483618
123	31	voided	2026-10-09 11:45:36.490351
124	30	PROCESSING	2026-10-09 11:47:00.745496
110	30	PROCESSING	2026-10-08 13:20:15.725568
98	24	PROCESSING	2026-10-07 18:53:06.235785
99	24	AUTHORIZED	2026-10-07 18:53:07.943536
111	30	PROCESSING	2026-10-08 13:20:17.074479
125	30	voided	2026-10-09 11:47:02.517253
126	33	PENDING	2026-10-09 15:28:18.932517
127	33	AUTHORIZED	2026-10-09 15:28:19.625025
128	33	PENDING	2026-10-09 15:29:21.484189
129	33	CAPTURED	2026-10-09 15:29:23.379424
100	25	PROCESSING	2026-10-07 19:14:20.202378
104	25	AUTHORIZED	2026-10-07 19:22:06.425276
130	33	PENDING	2026-10-09 15:30:10.250786
108	27	PROCESSING	2026-10-08 13:11:20.173424
109	27	AUTHORIZED	2026-10-08 13:11:20.965479
145	33	REFUNDED	2026-10-09 15:38:15.995058
\.


--
-- Name: idempotency_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.idempotency_id_seq', 34, true);


--
-- Name: payments_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_payment_id_seq', 33, true);


--
-- Name: retry_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.retry_jobs_id_seq', 28, true);


--
-- Name: status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.status_id_seq', 145, true);


--
-- Name: idempotency idempotency_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency
    ADD CONSTRAINT idempotency_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: idempotency idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency
    ADD CONSTRAINT idempotency_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (payment_id);


--
-- Name: retry_jobs retry_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.retry_jobs
    ADD CONSTRAINT retry_jobs_pkey PRIMARY KEY (id);


--
-- Name: status status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status
    ADD CONSTRAINT status_pkey PRIMARY KEY (id);


--
-- Name: payments unique_order_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT unique_order_id UNIQUE (order_id);


--
-- Name: retry_jobs retry_job_created; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retry_job_created AFTER INSERT ON public.retry_jobs FOR EACH ROW EXECUTE FUNCTION public.notify_retry_job();


--
-- Name: idempotency fk_idempotency_payments; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency
    ADD CONSTRAINT fk_idempotency_payments FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id);


--
-- Name: status fk_status_payments; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status
    ADD CONSTRAINT fk_status_payments FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id);


--
-- PostgreSQL database dump complete
--

