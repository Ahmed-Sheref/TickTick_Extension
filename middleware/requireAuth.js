import jwt from "jsonwebtoken";
import User from "../Models/User.js";

const requireAuth = async (req, res, next) =>
{
    try
    {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer "))
        {
            return res.status(401).json(
            {
                status: "error",
                message: "Missing authorization token"
            });
        }

        const token = authHeader.split(" ")[1];

        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findOne(
        {
            userId: payload.userId
        });

        if (!user)
        {
            return res.status(401).json(
            {
                status: "error",
                message: "Invalid token user"
            });
        }

        req.user =
        {
            userId: user.userId,
            mongoId: user._id.toString()
        };

        next();
    }
    catch (error)
    {
        return res.status(401).json(
        {
            status: "error",
            message: "Invalid or expired token"
        });
    }
};

export default requireAuth;