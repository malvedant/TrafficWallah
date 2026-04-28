# Smart Traffic Violation System

Production-ready Spring Boot REST API for detecting, storing, and analyzing traffic violations.

The project includes a standalone React + Tailwind frontend for Netlify and a Spring Boot backend API for Render.

## Folder Structure

```text
TrafficSpring/
|-- pom.xml
|-- README.md
`-- src
    `-- main
        |-- java
        |   `-- com
        |       `-- smarttraffic
        |           `-- violation
        |               |-- TrafficViolationSystemApplication.java
        |               |-- config
        |               |   `-- ApiLoggingFilter.java
        |               |-- controller
        |               |   `-- TrafficViolationController.java
        |               |-- dto
        |               |   |-- ApiErrorResponse.java
        |               |   |-- StatsResponse.java
        |               |   |-- TrafficCheckRequest.java
        |               |   |-- TrafficCheckResponse.java
        |               |   |-- ViolationResponse.java
        |               |   `-- ViolationUpdateRequest.java
        |               |-- entity
        |               |   `-- Violation.java
        |               |-- exception
        |               |   |-- GlobalExceptionHandler.java
        |               |   |-- InvalidRequestException.java
        |               |   `-- ResourceNotFoundException.java
        |               |-- repository
        |               |   |-- ViolationRepository.java
        |               |   `-- ViolationSpecifications.java
        |               `-- service
        |                   |-- ViolationService.java
        |                   `-- ViolationServiceImpl.java
        `-- resources
            |-- application-prod.properties
            `-- application.properties
```

## Business Rules

- Speed above `80` is a violation unless `isEmergency=true`
- Fine calculation:
  - speed > `120` => `5000`
  - speed > `100` => `2000`
  - otherwise => `1000`

## API Endpoints

### 1. Detect and save violation

`POST /traffic/check`

```json
{
  "vehicleId": "MH12AB1234",
  "speed": 110,
  "zone": "Pune",
  "isEmergency": false
}
```

### 2. Get all violations with pagination and sorting

`GET /traffic/all?page=0&size=5&sortBy=speed&order=desc`

### 3. Get single violation

`GET /traffic/1`

### 4. Update violation

`PUT /traffic/1`

```json
{
  "vehicleId": "MH12AB1234",
  "speed": 125,
  "zone": "Pune",
  "isEmergency": false
}
```

### 5. Delete violation

`DELETE /traffic/1`

### 6. Filter violations

`GET /traffic/filter?zone=Pune&minSpeed=90&maxSpeed=150&page=0&size=5&sortBy=speed&order=desc`

### 7. Analytics

`GET /traffic/stats`

## Local Development

### Run with H2

```bash
mvn clean install
java -jar target/app.jar
```

H2 console:

- URL: `http://localhost:8080/h2-console`
- JDBC URL: `jdbc:h2:mem:trafficdb`
- Username: `sa`
- Password: empty

Standalone frontend:

- React app lives in [frontend](C:/Users/kushd/OneDrive/Desktop/TrafficPranav/frontend)
- Set `VITE_API_BASE_URL` to your deployed Render backend URL before or during Netlify deploy
- Local frontend dev server:

```bash
cd frontend
npm install
npm run dev
```

## Production Run with MySQL

Set environment variables:

```bash
SPRING_PROFILES_ACTIVE=prod
DB_URL=jdbc:mysql://localhost:3306/traffic_db
DB_USERNAME=root
DB_PASSWORD=yourpassword
PORT=8080
```

Then run:

```bash
mvn clean install
java -jar target/app.jar
```

## Render Backend Deployment

1. Push the project to GitHub.
2. Create a MySQL database (Render does not provide native MySQL, so use an external MySQL provider such as Aiven, PlanetScale, Railway MySQL, Neon via compatible MySQL offering, or another hosted MySQL service).
3. In Render, create a new Web Service connected to the repository.
4. Render can auto-read [render.yaml](./render.yaml), or you can set the values manually.
5. Use the build command:

   ```bash
   mvn clean install
   ```

6. Use the start command:

   ```bash
   java -jar target/app.jar
   ```

7. Add environment variables in Render:
   - `SPRING_PROFILES_ACTIVE=prod`
   - `DB_URL=jdbc:mysql://<host>:3306/<database>`
   - `DB_USERNAME=<username>`
   - `DB_PASSWORD=<password>`
   - `PORT=10000` (or Render-provided port)
   - `JPA_DDL_AUTO=update`
   - `ALLOWED_ORIGINS=https://trafficspringkush.netlify.app,http://localhost:5173,http://127.0.0.1:5173`

8. Optional health check path:

   ```text
   /actuator/health
   ```

## Netlify Frontend Deployment

1. Use the `frontend` folder as the Netlify site root.
2. In Netlify environment variables, set:

   ```text
   VITE_API_BASE_URL=https://trafficspring.onrender.com
   ```

3. In Netlify:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy the site.
5. Make sure the backend `ALLOWED_ORIGINS` value includes `https://trafficspringkush.netlify.app`.

## Notes

- DTO layer is used for every API response/request
- API calls and violations are logged
- Validation and global exception handling are included
- `createdAt` is stored automatically in the `timestamp` column
