# Frontend API Integration Example

## 📝 **Email Settings API Call**

### **Endpoint:**
```http
POST /api/v1/User/email
```

### **Request Body:**
```json
{
  "userId": "USER_1234567890",
  "email": "user@example.com",
  "weeklyEmailEnabled": true
}
```

### **Response:**
```json
{
  "status": "success",
  "message": "Email settings updated!"
}
```

## 🔄 **Frontend Implementation**

### **React Example:**
```javascript
const updateEmailSettings = async (userId, email, weeklyEmailEnabled) => {
  try {
    const response = await fetch('/api/v1/User/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        email,
        weeklyEmailEnabled
      })
    });

    const result = await response.json();
    
    if (result.status === 'success') {
      alert('Email settings updated successfully!');
      // Update local state
      setUserSettings(prev => ({
        ...prev,
        email,
        weeklyEmailEnabled
      }));
    } else {
      alert('Error: ' + result.message);
    }
  } catch (error) {
    alert('Network error: ' + error.message);
  }
};

// Usage
updateEmailSettings('USER_123', 'user@example.com', true);
```

### **Vanilla JavaScript Example:**
```javascript
const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('email');
const emailToggle = document.getElementById('weekly-email-toggle');

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const userId = localStorage.getItem('userId');
  const email = emailInput.value;
  const weeklyEmailEnabled = emailToggle.checked;

  try {
    const response = await fetch('/api/v1/User/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        email,
        weeklyEmailEnabled
      })
    });

    const result = await response.json();
    
    if (result.status === 'success') {
      showMessage('Email settings updated!', 'success');
      localStorage.setItem('weeklyEmailEnabled', weeklyEmailEnabled);
    } else {
      showMessage('Error: ' + result.message, 'error');
    }
  } catch (error) {
    showMessage('Network error: ' + error.message, 'error');
  }
});
```

## ✅ **Key Points**

1. **Field Name**: Always use `weeklyEmailEnabled` (not `receiveWeeklyEmail`)
2. **Data Types**: 
   - `userId`: String
   - `email`: String (valid email)
   - `weeklyEmailEnabled`: Boolean
3. **Error Handling**: Check for `status: 'error'` in response
4. **User Experience**: Update local state after successful API call

## 🚫 **Common Mistakes to Avoid**

❌ **Wrong Field Name:**
```json
{
  "receiveWeeklyEmail": true  // ❌ Wrong field
}
```

✅ **Correct Field Name:**
```json
{
  "weeklyEmailEnabled": true  // ✅ Correct field
}
```

❌ **Missing Validation:**
```javascript
// Don't send invalid data
{
  "email": "invalid-email",  // ❌ Will fail validation
  "weeklyEmailEnabled": "true"  // ❌ Should be boolean, not string
}
```

✅ **Valid Data:**
```javascript
// Always validate before sending
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  alert('Please enter a valid email address');
  return;
}

// Always send boolean as actual boolean
{
  "weeklyEmailEnabled": true  // ✅ Boolean, not string
}
```
