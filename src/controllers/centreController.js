const centreModel = require("../models/centreModel");
const { NotFoundError } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");

const createCentre = asyncHandler(async (req, res) => {
  const centre = await centreModel.createCentre(req.body);
  res.status(201).json({ centre });
});

const listCentres = asyncHandler(async (req, res) => {
  const { location, page, pageSize } = req.query;
  const { total, items } = await centreModel.listCentres({ location, page, pageSize });

  // Attach each centre's tests (small N, so N+1 here is an acceptable trade
  // for readability -- see README for how this would be batched at scale).
  const withTests = await Promise.all(
    items.map(async (centre) => ({
      ...centre,
      tests: await centreModel.getTestsForCentre(centre.id),
    }))
  );

  res.json({ total, page, pageSize, items: withTests });
});

const getCentre = asyncHandler(async (req, res) => {
  const centre = await centreModel.getCentreById(req.params.id);
  if (!centre) throw new NotFoundError("Diagnostic centre not found.");

  const tests = await centreModel.getTestsForCentre(centre.id);
  res.json({ centre: { ...centre, tests } });
});

const addTest = asyncHandler(async (req, res) => {
  const centre = await centreModel.getCentreById(req.params.id);
  if (!centre) throw new NotFoundError("Diagnostic centre not found.");

  const test = await centreModel.addTestToCentre(centre.id, req.body);
  res.status(201).json({ test });
});

const listTestsForCentre = asyncHandler(async (req, res) => {
  const centre = await centreModel.getCentreById(req.params.id);
  if (!centre) throw new NotFoundError("Diagnostic centre not found.");

  const tests = await centreModel.getTestsForCentre(centre.id);
  res.json({ items: tests });
});

const listAllTests = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const { total, items } = await centreModel.listAllTests({ page, pageSize });
  res.json({ total, page, pageSize, items });
});

module.exports = { createCentre, listCentres, getCentre, addTest, listTestsForCentre, listAllTests };
