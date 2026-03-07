import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({path: 'D:\\Programming\\Back_end\\ticktick_extension\\config.env'});

const TICKTICK_AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TICKTICK_TOKEN_URL = 'https://ticktick.com/oauth/token';
const TICKTICK_API_URL = 'https://api.ticktick.com/open/v1';

export const getAuthUrl = (userId) =>
{
    try
    {
        const params = new URLSearchParams(
        {
            client_id: process.env.TICKTICK_CLIENT_ID,
            redirect_uri: process.env.TICKTICK_REDIRECT_URI,
            response_type: 'code',
            scope: 'tasks:write tasks:read',
            state: userId
        });

        return `${TICKTICK_AUTH_URL}?${params.toString()}`;
    }
    catch (error)
    {
        throw new Error(`Failed to build auth URL: ${error.message}`);
    }
};

export const exchangeToken = async (code) =>
{
    try
    {
        const credentials = Buffer.from(
            `${process.env.TICKTICK_CLIENT_ID}:${process.env.TICKTICK_CLIENT_SECRET}`
        ).toString('base64');

        const response = await axios.post(
            TICKTICK_TOKEN_URL,
            new URLSearchParams(
            {
                code,
                grant_type: 'authorization_code',
                redirect_uri: process.env.TICKTICK_REDIRECT_URI
            }),
            {
                headers:
                {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        return response.data;
    }
    catch (error)
    {
        throw new Error(`Failed to exchange token: ${error.message}`);
    }
};

export async function getProjectIds(accessToken)
{
    try
    {
        const response = await axios.get(
            `${TICKTICK_API_URL}/project`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        return response.data;
    }
    catch (error)
    {
        throw new Error(`Failed to get projects: ${error.message}`);
    }
}

export async function createProject(accessToken)
{
    try
    {
        const response = await axios.post(
            `${TICKTICK_API_URL}/project`,
            { name: "article", kind: "NOTE" },
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        console.log('Project created:', response.data.id);
        return response.data;
    }
    catch (error)
    {
        throw new Error(`Failed to create project: ${error.message}`);
    }
}

export async function projectExist(accessToken)
{
    try
    {
        const projects = await getProjectIds(accessToken);
        const existing = projects.find(p => p.name.toLowerCase() === 'article');

        if (existing)
        {
            console.log('Project found:', existing.id);
            return existing.id;
        }

        console.log('Project not found, creating...');
        const newProject = await createProject(accessToken);
        return newProject.id;
    }
    catch (error)
    {
        throw new Error(`Failed to check/create project: ${error.message}`);
    }
}

export const createTickTickTask = async (accessToken, { title, rawText, tags }) =>
{
    try
    {
        const projectId = await projectExist(accessToken);
        console.log('Using projectId:', projectId);

        const response = await axios.post(
            `${TICKTICK_API_URL}/task`,
            {
                title,
                projectId,
                content: rawText || '',
                tags: tags || [],
                kind: 'NOTE'
            },
            {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }
        );

        console.log('Task created:', response.data.id);
        return response.data;
    }
    catch (error)
    {
        throw new Error(`Failed to create task: ${error.message}`);
    }
};