import jwt from "jsonwebtoken";


const createAppToken = (user) =>
{
    let jt = jwt.sign(
        {
            userId: user.userId,
            mongoId: user._id.toString()
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d"
        }
    );
    // console.log(`\n------------------------${jt}---------------------\n`)
    return jt;
};

export {createAppToken};