import { Client, Databases, Account, Storage, ID, Permission, Role } from "appwrite";

const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const db = new Databases(client);
export const account = new Account(client);
export const storage = new Storage(client);
export { ID, Permission, Role };