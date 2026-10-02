import { Client, Databases, Account } from "appwrite";

const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const db = new Databases(client);
export const account = new Account(client); // Added for Auth
export { ID } from "appwrite";