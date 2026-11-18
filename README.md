# Learnwise — Student Performance Research

A JavaScript research prototype for exploring how learning behaviours relate to student outcomes. It uses the Portuguese-language records from the UCI Student Performance dataset and a custom JavaScript CART random forest. The interface is plain HTML/CSS/ES modules; the API uses Node.js, Express and Mongoose.

> Predictions are educational research estimates, not guaranteed examination results, diagnoses, or a basis for decisions about individual students. The UCI data reflects a small historical sample from two Portuguese schools and may not generalize elsewhere.

## Requirements

- Node.js 20 or newer and npm
- Internet access once to obtain the UCI dataset and install npm dependencies
- MongoDB Atlas (or another MongoDB deployment) for accounts and persistent prediction history

## Run locally

```sh
npm install
Copy-Item .env.example .env   # PowerShell; on macOS/Linux use: cp .env.example .env
```

Edit `.env` and set a MongoDB connection string, a random `JWT_SECRET` of at least 24 characters, and the email that should receive the admin role. Then fetch the dataset and train the model:

```sh
npm run setup
npm start
```

Open `http://localhost:3000`. For development with automatic server restarts use `npm run dev`.

The source workspace may be run without MongoDB to inspect the interface. Account and saved history endpoints then return a database configuration error; the app does not silently claim that local predictions have been persisted. Model predictions require the real dataset and a trained model file. If UCI is unreachable from the machine, download the official archive from the UCI page, put `student-por.csv` in `dataset/`, and run `npm run model:train`.

## Model implementation

`server/ml/train.js` parses the original semicolon-separated `student-por.csv`, uses final grade G3 as target, and groups it into Poor (0–9), Average (10–11), Good (12–15), and Excellent (16–20). It excludes G1 and G2 from the feature list. A fixed seed (4217) creates a stratified 80/20 holdout. Numeric missing values use the full dataset median in this first prototype; categorical values use learned category mappings. A 41-tree bootstrap CART forest is trained using JavaScript, then evaluated on the held-out rows. Accuracy, macro precision/recall/F1 and the confusion matrix are calculated from actual predictions and saved to `trained-models/random-forest.json`.

The output includes the complete serialized trees and preprocessing mapping, so prediction requests reuse the trained artifact and do not retrain. The result's tree vote agreement is shown as an uncalibrated confidence indicator. This implementation currently trains a random forest; decision tree, logistic regression, SVM and gradient boosting have not been evaluated and are not represented as completed experiments.

**Research note:** numeric categories in the custom tree implementation use category indices as an ordered split for categorical fields. This is a compact baseline implementation, not a substitute for a validated production ML library. The fixed split is reproducible but results can vary with model changes. Validate the experiment independently before drawing academic conclusions.

## Dataset features and form

The model uses 30 fields available in the UCI Portuguese file: school, sex, age, address, family size/status, parents' education/jobs, reason/guardian, travel/study time, failures, school/family support, paid lessons, activities, nursery/higher education plans, internet, romantic status, family relations, free time, going out, alcohol consumption, health and absences. The form collects student name and ID only for context/history; they are never model inputs. Where a form field is a simplified student-friendly scale, the API maps it to the matching UCI code. Other values absent from the model form use explicit baseline defaults and should be improved before a research deployment.

## Accounts and roles

Passwords are hashed with bcrypt. JWTs expire after seven days and are stored by this demonstration frontend in local storage. The configured `ADMIN_EMAIL` is assigned the administrator role on registration. Keep `.env` private, use HTTPS in deployment, and configure MongoDB network access and database users with least privilege. The first version provides an admin overview and a read-only student directory; it does not expose destructive student-management actions.

## Project structure

```text
public/                 Responsive dashboard and browser application
  css/styles.css
  js/app.js
server/
  config/database.js
  middleware/auth.js
  models/{User,Prediction}.js
  routes/api.js
  services/model.js
  ml/{download-data,train}.js
dataset/                UCI archive and CSV (downloaded locally)
trained-models/         Serialized model/evaluation (generated locally)
server.js
```

## API overview

- `GET /api/health`, `GET /api/model`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/predict`
- `GET /api/predictions` (authenticated; all records for admins)
- `GET /api/admin/summary`, `GET /api/admin/students` (admin only)

## Attribution

Dataset: Paulo Cortez and Alice Silva, *Student Performance*, UCI Machine Learning Repository, DOI [10.24432/C5TG7T](https://doi.org/10.24432/C5TG7T). Obtain the original files from [UCI](https://archive.ics.uci.edu/dataset/320/student+performance) and follow its dataset citation and license terms.
