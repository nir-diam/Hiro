const HelpArticle = require('../models/HelpArticle');

const listArticles = async () => {
  return HelpArticle.findAll({
    order: [
      ['order', 'ASC'],
      ['title', 'ASC'],
    ],
  });
};

const createArticle = async (payload) => {
  return HelpArticle.create(payload);
};

const updateArticle = async (id, updates) => {
  const article = await HelpArticle.findByPk(id);
  if (!article) return null;
  return article.update(updates);
};

const deleteArticle = async (id) => {
  const all = await HelpArticle.findAll();
  const toDelete = new Set();
  const stack = [id];

  while (stack.length) {
    const currentId = stack.pop();
    if (!currentId || toDelete.has(currentId)) continue;
    toDelete.add(currentId);
    const children = all.filter((article) => article.parentId === currentId);
    children.forEach((child) => stack.push(child.id));
  }

  if (!toDelete.size) return false;
  await HelpArticle.destroy({
    where: {
      id: Array.from(toDelete),
    },
  });
  return true;
};

module.exports = {
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
};

