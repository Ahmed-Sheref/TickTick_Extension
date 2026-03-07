
// "~backend #node_js #express"
const parseInput = (input) =>
{
    const listMatch = input.match(/~([^\s#]+)/);
    const tagsMatch = input.match(/#([^\s#~]+)/g);

    return {
        listName: listMatch ? listMatch[1] : 'inbox',
        tags: tagsMatch ? tagsMatch.map(tag => tag.replace('#', '')) : []
    };
};

export default parseInput;