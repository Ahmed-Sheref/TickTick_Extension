import jwt from "jsonwebtoken";

const createAppToken = (user) =>
{
    const secret = process.env.JWT_SECRET;

    console.log(
        "[JWT DIRECT CHECK]",
        {
            secretExists: Boolean(secret),
            secretType: typeof secret,
            secretLength:
                typeof secret === "string"
                    ? secret.length
                    : 0
        }
    );

    if (!secret)
    {
        throw new Error(
            "JWT_SECRET is missing inside createAppToken"
        );
    }

    return jwt.sign(
        {
            userId: user.userId,
            mongoId: user._id.toString()
        },
        secret,
        {
            expiresIn:
                process.env.JWT_EXPIRES_IN || "365d"
        }
    );
};

export
{
    createAppToken
};