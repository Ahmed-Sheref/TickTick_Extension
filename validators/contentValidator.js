const validateQuizObject = (quiz) => //! TODO Done
{
    if (!quiz || typeof quiz !== 'object')
    {
        return null; // Quiz is optional
    }
    
    if (!quiz.question || typeof quiz.question !== 'string' || quiz.question.trim() === '')
    {
        return 'quiz.question is required and must be a non-empty string';
    }
    
    if (!Array.isArray(quiz.options) || quiz.options.length < 2)
    {
        return 'quiz.options must be an array with at least 2 options';
    }
    
    if (quiz.options.some(option => !option || typeof option !== 'string' || option.trim() === ''))
    {
        return 'all quiz.options must be non-empty strings';
    }
    
    if (!quiz.correctAnswer || typeof quiz.correctAnswer !== 'string' || quiz.correctAnswer.trim() === '')
    {
        return 'quiz.correctAnswer is required and must be a non-empty string';
    }
    
    if (!quiz.options.includes(quiz.correctAnswer))
    {
        return 'quiz.correctAnswer must exist in quiz.options';
    }
    
    return null;
};

const validateContentInput = ({ userId, title, rawText }) => //! TODO Done
{
    if (!userId || typeof userId !== 'string' || userId.trim() === '')
    {
        return 'userId is required and must be a non-empty string';
    }
    
    if (!title || typeof title !== 'string' || title.trim() === '')
    {
        return 'title is required and must be a non-empty string';
    }
    
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '')
    {
        return 'rawText is required and must be a non-empty string';
    }
    
    if (title.length > 500)
    {
        return 'title must be less than 500 characters';
    }
    
    if (rawText.length > 100000)
    {
        return 'rawText must be less than 100,000 characters';
    }
    
    return null;
};

export { validateContentInput, validateQuizObject };